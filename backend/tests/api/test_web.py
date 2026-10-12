"""Health, security headers, SPA fallback, route guards and the MCP mount."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.responses import PlainTextResponse
from fastapi.routing import APIRoute, iter_route_contexts
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.api.app import create_app
from anbudsklar.api.deps import require_buyer, require_company_user, require_user
from anbudsklar.api.security import SAFE_METHODS, require_same_origin
from anbudsklar.api.web import SECURITY_HEADERS, SecurityHeadersMiddleware
from anbudsklar.config import Settings

from .factories import PUBLIC_URL, RecordingMailer, bound_session_factory

COMPANY_ONLY = {
    "/api/profile",
    "/api/profile/cpv-suggestions",
    "/api/matches",
    "/api/matches/{match_id}/dismiss",
    "/api/notices/{notice_id}/review",
}
SIGNED_IN = {"/api/reminders", "/api/reminders/{reminder_id}", "/api/notices/{notice_id}/reminders"}


async def test_health_endpoints(client: httpx.AsyncClient) -> None:
    for path in ("/health", "/api/healthz"):
        response = await client.get(path)
        assert response.status_code == 200
        assert response.json() == {"ok": True}
    response = await client.get("/api/health")
    assert response.json() == {"ok": True, "database": "ok"}


async def test_every_response_carries_the_security_headers(client: httpx.AsyncClient) -> None:
    for path in ("/api/healthz", "/api/finns-inte"):
        response = await client.get(path)
        for name, value in SECURITY_HEADERS.items():
            assert response.headers[name] == value
    csp = SECURITY_HEADERS["Content-Security-Policy"]
    assert "unsafe-inline" not in csp
    assert "frame-ancestors 'none'" in csp
    assert "base-uri 'none'" in csp


async def test_a_route_can_set_its_own_header() -> None:
    inner = FastAPI()

    @inner.get("/logo")
    async def logo() -> PlainTextResponse:
        return PlainTextResponse("x", headers={"Content-Security-Policy": "default-src 'none'"})

    inner.add_middleware(SecurityHeadersMiddleware)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=inner), base_url=PUBLIC_URL) as http:
        response = await http.get("/logo")
    assert response.headers["Content-Security-Policy"] == "default-src 'none'"
    assert response.headers["X-Frame-Options"] == "DENY"


def _dependency_calls(dependant: Dependant) -> Iterator[Callable[..., object]]:
    for dependency in dependant.dependencies:
        if dependency.call is not None:
            yield dependency.call
        yield from _dependency_calls(dependency)


def test_routes_are_guarded(app: FastAPI) -> None:
    """Every write checks the origin; admin, company and personal routes check the role."""

    api_routes = [
        route
        for route in iter_route_contexts(app.routes)
        if isinstance(route.original_route, APIRoute) and (route.path or "").startswith("/api/")
    ]
    assert len(api_routes) > 30
    for route in api_routes:
        calls = set(_dependency_calls(route.dependant))
        if (route.methods or set()) - SAFE_METHODS:
            assert require_same_origin in calls, route.path
        if (route.path or "").startswith("/api/admin/"):
            assert require_buyer in calls, route.path
        if route.path in COMPANY_ONLY:
            assert require_company_user in calls, route.path
        if route.path in SIGNED_IN:
            assert require_user in calls, route.path


@pytest.fixture
async def spa_client(
    settings: Settings, tmp_path: Path, db_session: AsyncSession, engine: AiEngine
) -> AsyncIterator[httpx.AsyncClient]:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Anbudshjälpen</title>")
    (dist / "assets" / "app.js").write_text("console.log('ok')")
    (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("hemlig")
    app = create_app(
        settings.model_copy(update={"frontend_dist": dist}),
        engine=engine,
        mailer=RecordingMailer(),
        session_factory=bound_session_factory(db_session),
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC_URL) as http,
    ):
        yield http


async def test_spa_fallback_serves_pages_and_files_but_never_html_for_missing_files(
    spa_client: httpx.AsyncClient,
) -> None:
    for path in ("/", "/upphandlingar/abc"):
        response = await spa_client.get(path)
        assert response.status_code == 200
        assert "<title>Anbudshjälpen</title>" in response.text
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["content-security-policy"] == SECURITY_HEADERS["Content-Security-Policy"]
    assert (await spa_client.get("/assets/app.js")).status_code == 200
    assert (await spa_client.get("/favicon.svg")).status_code == 200
    for missing in ("/assets/nope.js", "/logo.png", "/%2e%2e/secret.txt"):
        assert (await spa_client.get(missing)).status_code == 404, missing
    for api_path in ("/api/nope", "/mcp/anything", "/mcp"):
        response = await spa_client.get(api_path)
        assert response.status_code == 404, api_path
        assert response.headers["content-type"] == "application/json"


def test_missing_frontend_build_fails_at_startup(settings: Settings, tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"index\.html"):
        create_app(settings.model_copy(update={"frontend_dist": tmp_path / "empty"}))


async def test_mcp_is_served_on_exact_paths_with_its_lifespan(
    settings: Settings, db_session: AsyncSession, engine: AiEngine
) -> None:
    key = "test-mcp-key"
    app = create_app(
        settings.model_copy(update={"mcp_enabled": True, "mcp_api_keys": [SecretStr(key)]}),
        engine=engine,
        mailer=RecordingMailer(),
        session_factory=bound_session_factory(db_session),
    )
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    }
    headers = {"Accept": "application/json, text/event-stream", "X-Api-Key": key}
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC_URL) as http,
    ):
        for path in ("/mcp", "/mcp/"):
            response = await http.post(path, json=initialize, headers=headers)
            assert response.status_code == 200, (path, response.text)
            assert response.json()["result"]["serverInfo"]["name"] == "anbudsklar"
        unauthorized = await http.post("/mcp", json=initialize, headers={"Accept": headers["Accept"]})
        assert unauthorized.status_code == 401


def test_mcp_routes_are_absent_when_disabled(app: FastAPI) -> None:
    assert not [route for route in iter_route_contexts(app.routes) if (route.path or "").startswith("/mcp")]


async def test_openapi_documents_the_upload_routes(client: httpx.AsyncClient) -> None:
    spec = (await client.get("/api/openapi.json")).json()
    for path in ("/api/notices/{notice_id}/review", "/api/admin/notices/{notice_id}/documents"):
        assert "multipart/form-data" in spec["paths"][path]["post"]["requestBody"]["content"]
