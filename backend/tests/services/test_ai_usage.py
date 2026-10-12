"""Usage and cost statistics: what is recorded per call and how the sums are made."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineRun, TokenUsage
from anbudsklar.contracts import Task
from anbudsklar.models import AiCall
from anbudsklar.services.ai_usage import (
    TokenPrices,
    combined_usage,
    record_call,
    usage_summary,
    usage_view,
)
from api.factories import add_notice

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)
PRICES = TokenPrices(input_sek_per_million=30.0, output_sek_per_million=120.0)


def _call(
    task: Task, *, tokens: tuple[int, int] | None, model: str | None = "gpt-x", days_ago: float = 0
) -> AiCall:
    return AiCall(
        task=task.value,
        engine="openai" if model else "heuristic",
        model=model,
        input_tokens=tokens[0] if tokens else None,
        output_tokens=tokens[1] if tokens else None,
        attempts=1,
        created_at=NOW - timedelta(days=days_ago),
    )


async def test_a_call_is_recorded_with_its_counts_and_notice(db_session: AsyncSession) -> None:
    notice = await add_notice(db_session, title="Ommålning (fiktiv)", external_id="TEST-U1")
    run = EngineRun(engine="openai", model="gpt-x", attempts=2, usage=TokenUsage(9_000, 400))
    await record_call(db_session, Task.ANSWER_QUESTION, run, notice_id=notice.id)
    await record_call(db_session, Task.ANSWER_RULES, EngineRun(engine="heuristic"))

    calls = {call.task: call for call in await db_session.scalars(select(AiCall))}
    question = calls["besvara_fraga"]
    assert (question.engine, question.model, question.attempts) == ("openai", "gpt-x", 2)
    assert (question.input_tokens, question.output_tokens) == (9_000, 400)
    assert question.notice_id == notice.id
    rules = calls["regelhjalpen"]
    assert (rules.input_tokens, rules.output_tokens, rules.notice_id) == (None, None, None)


async def test_the_summary_sums_the_window_by_task_and_model(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            _call(Task.ANSWER_QUESTION, tokens=(10_000, 500)),
            _call(Task.ANSWER_QUESTION, tokens=(20_000, 500), days_ago=6),
            _call(Task.INTERPRET_DOCUMENT, tokens=(100_000, 4_000), model="gpt-y", days_ago=2),
            _call(Task.ANSWER_RULES, tokens=None, model=None),  # the heuristic engine: counted, no tokens
            _call(Task.ANSWER_QUESTION, tokens=(999_999, 999), days_ago=8),  # outside a 7-day window
        ]
    )
    await db_session.flush()

    view = await usage_summary(db_session, days=7, now=NOW, prices=PRICES)
    assert (view.since, view.until, view.days) == (NOW - timedelta(days=7), NOW, 7)
    assert (view.calls, view.calls_with_usage) == (4, 3)
    assert (view.input_tokens, view.output_tokens) == (130_000, 5_000)
    # 130 000 × 30 kr + 5 000 × 120 kr, per million tokens = 3,90 + 0,60.
    assert view.cost_sek == 4.5
    assert (view.price_input_sek_per_million, view.price_output_sek_per_million) == (30.0, 120.0)

    # The tasks in their own order, whatever was called most.
    assert [item.task for item in view.by_task] == ["tolka_underlag", "besvara_fraga", "regelhjalpen"]
    questions = view.by_task[1]
    assert (questions.calls, questions.calls_with_usage) == (2, 2)
    assert (questions.input_tokens, questions.output_tokens, questions.cost_sek) == (30_000, 1_000, 1.02)
    rules = view.by_task[2]
    assert (rules.calls, rules.calls_with_usage, rules.cost_sek) == (1, 0, None)  # not "free"

    # The models with the most calls first.
    assert [(item.engine, item.model, item.calls) for item in view.by_model] == [
        ("openai", "gpt-x", 2),
        ("heuristic", None, 1),
        ("openai", "gpt-y", 1),
    ]


async def test_without_prices_the_tokens_are_counted_but_no_cost_is_given(db_session: AsyncSession) -> None:
    db_session.add(_call(Task.ANSWER_QUESTION, tokens=(10_000, 500)))
    await db_session.flush()
    view = await usage_summary(db_session, days=30, now=NOW, prices=None)
    assert (view.calls, view.input_tokens, view.cost_sek) == (1, 10_000, None)
    assert (view.price_input_sek_per_million, view.by_task[0].cost_sek) == (None, None)


async def test_an_empty_window_is_an_empty_summary(db_session: AsyncSession) -> None:
    view = await usage_summary(db_session, days=30, now=NOW, prices=PRICES)
    assert (view.calls, view.calls_with_usage, view.input_tokens, view.output_tokens) == (0, 0, 0, 0)
    assert (view.cost_sek, view.by_task, view.by_model) == (None, [], [])


def test_the_cost_is_rounded_to_ore() -> None:
    assert PRICES.cost_sek(1_234, 56) == 0.04  # 0,03702 + 0,00672 kr
    assert PRICES.cost_sek(0, 0) == 0.0
    assert TokenPrices(2.5, 10.0).cost_sek(1_000_000, 1_000_000) == 12.5


def test_the_view_of_one_answer_follows_the_run() -> None:
    run = EngineRun(engine="openai", usage=TokenUsage(9_000, 400))
    priced = usage_view(run, PRICES)
    assert priced is not None
    assert (priced.input_tokens, priced.output_tokens, priced.cost_sek) == (9_000, 400, 0.32)
    unpriced = usage_view(run, None)
    assert unpriced is not None and unpriced.cost_sek is None
    assert usage_view(EngineRun(engine="heuristic"), PRICES) is None


def test_several_calls_behind_one_answer_are_summed_or_unknown() -> None:
    first = EngineRun(engine="openai", usage=TokenUsage(1_000, 50))
    second = EngineRun(engine="openai", usage=TokenUsage(2_000, 70))
    assert combined_usage([first, second]) == TokenUsage(3_000, 120)
    assert combined_usage([first, EngineRun(engine="openai")]) is None
    assert combined_usage([]) is None
