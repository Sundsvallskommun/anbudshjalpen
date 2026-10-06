"""Background work after a response: one re-assessment run per company at a time."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.services import background
from anbudsklar.services.background import MAX_REMATCH_PASSES, MatchRefresher, SessionFactory

COMPANY = uuid.uuid4()


@asynccontextmanager
async def no_session() -> AsyncIterator[AsyncSession]:
    raise AssertionError("the fake pass opens no session")
    yield  # pragma: no cover


class Passes:
    """Stands in for one re-assessment pass; the first one waits until it is released."""

    def __init__(self, results: list[bool]) -> None:
        self.results = results
        self.calls = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def __call__(
        self, session_factory: SessionFactory, engine: AiEngine, company_id: uuid.UUID
    ) -> bool:
        self.calls += 1
        if self.calls == 1:
            self.started.set()
            await self.release.wait()
        return self.results[min(self.calls, len(self.results)) - 1]


@pytest.fixture
def engine() -> AiEngine:
    return HeuristicEngine()


async def test_a_save_during_a_run_asks_for_one_more_pass_instead_of_a_second_run(
    monkeypatch: pytest.MonkeyPatch, engine: AiEngine
) -> None:
    passes = Passes([True])
    monkeypatch.setattr(background, "_rematch", passes)
    refresher = MatchRefresher()

    first = asyncio.create_task(refresher.run(no_session, engine, COMPANY))
    await passes.started.wait()
    await refresher.run(no_session, engine, COMPANY)  # returns at once: a run is going
    await refresher.run(no_session, engine, COMPANY)
    assert passes.calls == 1

    passes.release.set()
    await first
    assert passes.calls == 2  # one more pass for both saves, which reads the latest profile

    await refresher.run(no_session, engine, COMPANY)  # nothing is running any more
    assert passes.calls == 3


async def test_a_pass_that_kept_nothing_is_repeated_a_few_times_at_most(
    monkeypatch: pytest.MonkeyPatch, engine: AiEngine
) -> None:
    passes = Passes([False])
    passes.release.set()
    monkeypatch.setattr(background, "_rematch", passes)

    await MatchRefresher().run(no_session, engine, COMPANY)
    assert passes.calls == MAX_REMATCH_PASSES  # then match_all takes over
