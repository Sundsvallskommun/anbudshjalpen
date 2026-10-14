"""Saving the profile with a language-model engine: the matches are re-assessed after the answer."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.heuristic import HeuristicEngine

from .factories import Demo, add_cpv_codes, login


class ModelEngine(HeuristicEngine):
    """Answers like the heuristic engine but, like a language model, is too slow to wait for.

    A test that clears `release` holds every assessment until it sets it again, so the run
    can be observed while it is going.
    """

    name = "eneo"

    def __init__(self) -> None:
        super().__init__()
        self.release = asyncio.Event()
        self.release.set()
        self.started = asyncio.Event()

    async def assess_match(self, *args: Any, **kwargs: Any) -> Any:
        self.started.set()
        await self.release.wait()
        return await super().assess_match(*args, **kwargs)


@pytest.fixture
def engine() -> ModelEngine:
    return ModelEngine()


async def test_the_answer_has_no_count_and_the_matches_follow_after_it(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, {"45442100": "Målning"})
    await login(client, "foretagare")

    saved = await client.put(
        "/api/profile", json={"description": "Vi målar skolor och förskolor.", "cpv_codes": ["45442100"]}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["fitting_notices"] is None
    # The test client returns once the background task has run.
    matches = (await client.get("/api/matches")).json()
    assert [(match["notice"]["id"], match["engine"]) for match in matches] == [(str(demo.notice.id), "eneo")]


async def test_the_status_says_so_while_the_matches_are_being_assessed(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo, engine: ModelEngine
) -> None:
    await add_cpv_codes(db_session, {"45442100": "Målning"})
    await login(client, "foretagare")
    engine.release.clear()

    assert (await client.get("/api/matches/status")).json() == {"is_assessing": False}
    update = {"description": "Vi målar skolor och förskolor.", "cpv_codes": ["45442100"]}
    saving = asyncio.create_task(client.put("/api/profile", json=update))
    await engine.started.wait()
    assert (await client.get("/api/matches/status")).json() == {"is_assessing": True}

    engine.release.set()
    saved = await saving
    assert saved.status_code == 200, saved.text
    assert (await client.get("/api/matches/status")).json() == {"is_assessing": False}
    assert [match["engine"] for match in (await client.get("/api/matches")).json()] == ["eneo"]
