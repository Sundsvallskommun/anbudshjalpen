"""Saving the profile with a language-model engine: the matches are re-assessed after the answer."""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.ai.heuristic import HeuristicEngine

from .factories import Demo, add_cpv_codes, login


class ModelEngine(HeuristicEngine):
    """Answers like the heuristic engine but, like a language model, is too slow to wait for."""

    name = "eneo"


@pytest.fixture
def engine() -> AiEngine:
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
