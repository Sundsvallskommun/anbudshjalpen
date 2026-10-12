"""The access code that gates the whole service (decision 0010)."""

from __future__ import annotations

import httpx
import pytest
from pydantic import SecretStr

from anbudsklar.api.gate import GATE_COOKIE
from anbudsklar.config import Settings

from .factories import Demo

CODE = "workshop-2026"


async def test_without_a_code_the_service_is_open(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/config")).json()["gate_required"] is False
    assert (await client.get("/api/notices")).status_code == 200


class TestGated:
    @pytest.fixture
    def settings(self, settings: Settings) -> Settings:
        return settings.model_copy(update={"access_code": SecretStr(CODE), "lab_enabled": True})

    async def test_everything_waits_for_the_code(self, client: httpx.AsyncClient, demo: Demo) -> None:
        config = await client.get("/api/config")
        assert config.json()["gate_required"] is True
        assert config.headers["cache-control"] == "no-store"
        for path in ("/api/notices", "/api/session", f"/api/notices/{demo.notice.id}"):
            response = await client.get(path)
            assert response.status_code == 401, path
            assert response.json()["detail"] == "Ange accesskoden för att använda tjänsten."
        asked = await client.post(f"/api/notices/{demo.notice.id}/questions", json={"question": "Vad krävs?"})
        assert asked.status_code == 401  # the AI is behind the gate too
        assert (await client.get("/health")).status_code == 200

    async def test_the_wrong_code_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.post("/api/gate", json={"code": "fel"})
        assert response.status_code == 403
        assert "accesskod" in response.json()["detail"]
        assert GATE_COOKIE not in response.headers.get("set-cookie", "")

    async def test_the_code_opens_the_service_for_this_browser(
        self, client: httpx.AsyncClient, demo: Demo
    ) -> None:
        response = await client.post("/api/gate", json={"code": f" {CODE} "})
        assert response.status_code == 204
        cookie = response.headers["set-cookie"]
        assert (
            cookie.startswith(f"{GATE_COOKIE}=")
            and "HttpOnly" in cookie
            and "SameSite=lax" in cookie.replace("Lax", "lax")
        )
        assert (await client.get("/api/config")).json()["gate_required"] is False
        assert (await client.get("/api/notices")).status_code == 200
        assert (await client.post("/api/session/login", json={"persona": "foretagare"})).status_code == 200
        # A forged or stale cookie does not pass.
        client.cookies.set(GATE_COOKIE, "0" * 64)
        assert (await client.get("/api/notices")).status_code == 401
