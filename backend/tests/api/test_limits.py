"""Abuse controls: rate limits, the AI call cap, body limits, bounded sessions and input lengths."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from anbudsklar.api.limits import (
    DEFAULT_LIMITS,
    MAX_BODY_BYTES,
    AiSlots,
    Limit,
    RateLimiter,
)
from anbudsklar.api.security import ConversationStore, SessionStore, conversation_owner
from anbudsklar.config import Settings
from anbudsklar.services.personas import buyer_persona_enabled

from .factories import Demo, login


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_token_buckets_refill_evenly_and_are_per_client_and_scope() -> None:
    clock = FakeClock()
    limiter = RateLimiter({**DEFAULT_LIMITS, "questions": Limit(2, 60)}, clock=clock)
    assert limiter.hit("questions", "10.0.0.1") is None
    assert limiter.hit("questions", "10.0.0.1") is None
    wait = limiter.hit("questions", "10.0.0.1")
    assert wait == pytest.approx(30.0)
    assert limiter.hit("questions", "10.0.0.2") is None  # another client
    assert limiter.hit("rules", "10.0.0.1") is None  # another scope
    clock.now += 30
    assert limiter.hit("questions", "10.0.0.1") is None
    assert limiter.hit("questions", "10.0.0.1") is not None


def test_the_limiter_forgets_the_least_recent_clients_first() -> None:
    limiter = RateLimiter({**DEFAULT_LIMITS, "login": Limit(1, 600)}, max_clients=2, clock=FakeClock())
    assert limiter.hit("login", "a") is None
    assert limiter.hit("login", "b") is None
    assert limiter.hit("login", "c") is None  # "a" is forgotten
    assert limiter.hit("login", "c") is not None
    assert limiter.hit("login", "a") is None


@pytest.fixture
def strict(app: FastAPI) -> RateLimiter:
    limits = {scope: Limit(2, 600) for scope in DEFAULT_LIMITS}
    app.state.rate_limiter = RateLimiter(limits)
    return app.state.rate_limiter


async def test_anonymous_ai_endpoints_and_login_are_rate_limited(
    client: httpx.AsyncClient, demo: Demo, strict: RateLimiter
) -> None:
    question = f"/api/notices/{demo.notice.id}/questions"
    for _ in range(2):
        assert (await client.post(question, json={"question": "Vilka krav finns?"})).status_code == 200
    limited = await client.post(question, json={"question": "Vilka krav finns?"})
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) >= 1
    assert "Vänta" in limited.json()["detail"]

    for _ in range(2):
        assert (await client.post("/api/rules/ask", json={"question": "Vad är LOU?"})).status_code == 200
    assert (await client.post("/api/rules/ask", json={"question": "Vad är LOU?"})).status_code == 429

    for _ in range(2):
        await login(client, "foretagare")
    assert (await client.post("/api/session/login", json={"persona": "foretagare"})).status_code == 429


async def test_ai_calls_wait_for_a_free_slot_and_then_give_up() -> None:
    slots = AiSlots(size=1, wait_seconds=0.05)
    async with slots.hold():
        with pytest.raises(HTTPException) as refused:
            async with slots.hold():
                pass
    assert refused.value.status_code == 503
    async with slots.hold():  # released again
        pass


async def test_a_busy_engine_answers_503(client: httpx.AsyncClient, app: FastAPI, demo: Demo) -> None:
    app.state.ai_slots = AiSlots(size=1, wait_seconds=0.05)
    async with app.state.ai_slots.hold():
        response = await client.post("/api/rules/ask", json={"question": "Vad är LOU?"})
    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"


async def test_large_bodies_are_refused_before_they_are_read(client: httpx.AsyncClient, demo: Demo) -> None:
    padding = "x" * (MAX_BODY_BYTES + 1)
    declared = await client.post(
        "/api/rules/ask", content=f'{{"question": "{padding}"}}', headers={"Content-Type": "application/json"}
    )
    assert declared.status_code == 413
    assert declared.headers["x-content-type-options"] == "nosniff"

    async def chunks() -> AsyncIterator[bytes]:
        yield b'{"question": "'
        for _ in range(MAX_BODY_BYTES // 65536 + 2):
            yield b"x" * 65536
        yield b'"}'

    streamed = await client.post(
        "/api/rules/ask", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert streamed.status_code == 413


async def test_uploads_keep_their_own_larger_limit(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "foretagare")
    pages = ["Anbud (fiktivt utkast)", *["Vi uppfyller kraven. " * 600] * 100]
    draft = "\f".join(pages).encode()
    assert len(draft) > MAX_BODY_BYTES
    response = await client.post(
        f"/api/notices/{demo.notice.id}/review", files={"file": ("utkast.txt", draft, "text/plain")}
    )
    assert response.status_code == 200, response.text


def test_sessions_are_bounded_and_expire_oldest_first() -> None:
    store = SessionStore(max_sessions=2)
    first, second = store.create(uuid.uuid4()), store.create(uuid.uuid4())
    third = store.create(uuid.uuid4())
    assert len(store) == 2
    assert store.user_id(first) is None
    assert store.user_id(second) is not None and store.user_id(third) is not None

    expiring = SessionStore(max_age_seconds=0)
    token = expiring.create(uuid.uuid4())
    assert expiring.user_id(token) is None
    expiring.create(uuid.uuid4())
    assert len(expiring) == 1


def test_conversations_belong_to_one_owner_and_expire() -> None:
    store = ConversationStore(max_conversations=2)
    mine, theirs = conversation_owner(None), conversation_owner(None)
    assert mine != theirs and conversation_owner(mine) == mine
    assert conversation_owner("x" * 500) != "x" * 500  # an odd cookie value gets a fresh token
    store.bind("c1", mine)
    assert store.belongs_to("c1", mine) is True
    assert store.belongs_to("c1", theirs) is False
    assert store.belongs_to("c2", mine) is False
    store.bind("c2", theirs)
    store.bind("c1", mine)  # continuing moves it to the back
    store.bind("c3", theirs)
    assert store.belongs_to("c1", mine) is True
    assert store.belongs_to("c2", theirs) is False  # the oldest went first

    expiring = ConversationStore(max_age_seconds=0)
    expiring.bind("c1", mine)
    assert expiring.belongs_to("c1", mine) is False


def test_the_buyer_persona_is_off_in_production_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEMO_BUYER_ENABLED", raising=False)
    secret = "a-long-test-secret-a-long-test-secret"

    def settings(**values: Any) -> Settings:
        return Settings(_env_file=None, **values)

    assert buyer_persona_enabled(settings(environment="development")) is True
    assert buyer_persona_enabled(settings(environment="test")) is True
    assert buyer_persona_enabled(settings(environment="production", session_secret=secret)) is False


def test_demo_buyer_enabled_overrides_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "a-long-test-secret-a-long-test-secret"
    monkeypatch.setenv("DEMO_BUYER_ENABLED", "true")
    production = Settings(_env_file=None, environment="production", session_secret=secret)
    assert production.demo_buyer_enabled is True
    assert buyer_persona_enabled(production) is True
    monkeypatch.setenv("DEMO_BUYER_ENABLED", "false")
    assert buyer_persona_enabled(Settings(_env_file=None, environment="development")) is False
    monkeypatch.setenv("DEMO_BUYER_ENABLED", "")  # empty counts as unset, as in the Dokploy compose file
    assert Settings(_env_file=None, environment="development").demo_buyer_enabled is None


async def test_profile_list_items_have_a_length_cap(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "foretagare")
    response = await client.put(
        "/api/profile", json={"description": "Måleri", "municipalities": ["S" * 101], "cpv_codes": []}
    )
    assert response.status_code == 422
    response = await client.put(
        "/api/profile", json={"description": "Måleri", "certifications": ["ISO 9001" * 30], "cpv_codes": []}
    )
    assert response.status_code == 422


async def test_rules_session_ids_must_be_uuids(client: httpx.AsyncClient) -> None:
    for session_id in ("s" * 101, "../publish/?published=true#"):
        response = await client.post(
            "/api/rules/ask", json={"question": "Vad är LOU?", "session_id": session_id}
        )
        assert response.status_code == 422
