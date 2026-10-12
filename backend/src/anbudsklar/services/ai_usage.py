"""Usage and cost statistics for the AI engine, shown on Drift.

Every service that calls the engine records the completed call here (`record_call`), in
its own transaction, and the Drift page reads the sums (`usage_summary`). The counts are
the model provider's own, passed on by the engine in `EngineRun.usage`; an engine that
reports none (the heuristic engine, and the Eneo adapter until it reads Eneo's counts,
see `anbudsklar.ai.eneo`) still has its calls counted, without tokens. The cost is an
estimate from the prices the operator set, never a figure from an invoice.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineRun, TokenUsage
from anbudsklar.api.schemas import AiUsageModelView, AiUsageTaskView, AiUsageView, TokenUsageView
from anbudsklar.config import Settings
from anbudsklar.contracts import Task
from anbudsklar.models import AiCall

DEFAULT_DAYS = 30
MAX_DAYS = 365
_TOKENS_PER_PRICE = 1_000_000


@dataclass(frozen=True)
class TokenPrices:
    """SEK per million tokens in and out, as the operator set them."""

    input_sek_per_million: float
    output_sek_per_million: float

    def cost_sek(self, input_tokens: int, output_tokens: int) -> float:
        """The estimate, rounded to öre: a demo question costs öre, a month of interpretations kronor."""

        cost = (
            input_tokens * self.input_sek_per_million + output_tokens * self.output_sek_per_million
        ) / _TOKENS_PER_PRICE
        return round(cost, 2)


def token_prices(settings: Settings) -> TokenPrices | None:
    """The prices when both are set; one without the other would make every estimate wrong."""

    if settings.ai_price_input_sek_per_million is None or settings.ai_price_output_sek_per_million is None:
        return None
    return TokenPrices(settings.ai_price_input_sek_per_million, settings.ai_price_output_sek_per_million)


def usage_view(run: EngineRun, prices: TokenPrices | None) -> TokenUsageView | None:
    """What one answer cost, for its view; None when the engine did not count."""

    return _usage_view(run.usage, prices)


def combined_usage(runs: list[EngineRun]) -> TokenUsage | None:
    """The sum over several runs behind one answer, or None when any of them did not count."""

    usages = [run.usage for run in runs]
    if not usages or any(usage is None for usage in usages):
        return None
    total = TokenUsage(0, 0)
    for usage in usages:
        assert usage is not None
        total = total + usage
    return total


def _usage_view(usage: TokenUsage | None, prices: TokenPrices | None) -> TokenUsageView | None:
    if usage is None:
        return None
    cost = prices.cost_sek(usage.input_tokens, usage.output_tokens) if prices else None
    return TokenUsageView(input_tokens=usage.input_tokens, output_tokens=usage.output_tokens, cost_sek=cost)


async def record_call(
    session: AsyncSession, task: Task, run: EngineRun, *, notice_id: uuid.UUID | None = None
) -> AiCall:
    """Record a completed call; the caller's transaction commits it with the result it produced."""

    call = AiCall(
        task=task.value,
        engine=run.engine,
        model=run.model,
        input_tokens=run.usage.input_tokens if run.usage else None,
        output_tokens=run.usage.output_tokens if run.usage else None,
        attempts=run.attempts,
        notice_id=notice_id,
    )
    session.add(call)
    await session.flush()
    return call


_TASK_ORDER = {task.value: index for index, task in enumerate(Task)}


async def usage_summary(
    session: AsyncSession, *, days: int, now: datetime, prices: TokenPrices | None
) -> AiUsageView:
    """Calls, tokens and the estimated cost over the last `days` days, by task and by model.

    One query grouped by task, engine and model gives both breakdowns. The token sums
    cover only the calls that reported tokens (`calls_with_usage`), so the page can say
    when the figures leave calls out.
    """

    since = now - timedelta(days=days)
    rows = (
        await session.execute(
            select(
                AiCall.task,
                AiCall.engine,
                AiCall.model,
                func.count().label("calls"),
                func.count(AiCall.input_tokens).label("counted"),
                func.coalesce(func.sum(AiCall.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(AiCall.output_tokens), 0).label("output_tokens"),
            )
            .where(AiCall.created_at >= since, AiCall.created_at <= now)
            .group_by(AiCall.task, AiCall.engine, AiCall.model)
        )
    ).all()

    by_task: dict[str, _Sum] = {}
    by_model: dict[tuple[str, str | None], _Sum] = {}
    total = _Sum()
    for task, engine, model, calls, counted, input_tokens, output_tokens in rows:
        part = _Sum(int(calls), int(counted), int(input_tokens or 0), int(output_tokens or 0))
        by_task[task] = by_task.get(task, _Sum()) + part
        by_model[(engine, model)] = by_model.get((engine, model), _Sum()) + part
        total = total + part

    return AiUsageView(
        since=since,
        until=now,
        days=days,
        calls=total.calls,
        calls_with_usage=total.counted,
        input_tokens=total.input_tokens,
        output_tokens=total.output_tokens,
        cost_sek=total.cost(prices),
        price_input_sek_per_million=prices.input_sek_per_million if prices else None,
        price_output_sek_per_million=prices.output_sek_per_million if prices else None,
        by_task=[
            part.task_view(task, prices)
            for task, part in sorted(
                by_task.items(), key=lambda item: _TASK_ORDER.get(item[0], len(_TASK_ORDER))
            )
        ],
        by_model=[
            part.model_view(engine, model, prices)
            for (engine, model), part in sorted(
                by_model.items(), key=lambda item: (-item[1].calls, item[0][0], item[0][1] or "")
            )
        ],
    )


@dataclass(frozen=True)
class _Sum:
    calls: int = 0
    counted: int = 0
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: _Sum) -> _Sum:
        return _Sum(
            self.calls + other.calls,
            self.counted + other.counted,
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
        )

    def cost(self, prices: TokenPrices | None) -> float | None:
        """None without prices, and None when no call reported tokens: zero would read as free."""

        if prices is None or self.counted == 0:
            return None
        return prices.cost_sek(self.input_tokens, self.output_tokens)

    def task_view(self, task: str, prices: TokenPrices | None) -> AiUsageTaskView:
        return AiUsageTaskView(
            task=task,
            calls=self.calls,
            calls_with_usage=self.counted,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            cost_sek=self.cost(prices),
        )

    def model_view(self, engine: str, model: str | None, prices: TokenPrices | None) -> AiUsageModelView:
        return AiUsageModelView(
            engine=engine,
            model=model,
            calls=self.calls,
            calls_with_usage=self.counted,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            cost_sek=self.cost(prices),
        )
