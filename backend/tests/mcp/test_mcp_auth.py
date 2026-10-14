"""Authentication, routing and host checks on the MCP endpoint, at the HTTP level."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from mcp_harness import BASE_URL, KEY, PUBLIC_URL, http_client, make_app, make_settings
from pydantic import SecretStr

from anbudsklar.mcp import build_mcp

LIST_TOOLS = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


async def post_tools_list(
    app: FastAPI, headers: dict[str, str], *, path: str = "/mcp", base_url: str = BASE_URL
) -> httpx.Response:
    async with http_client(app, base_url) as http:
        return await http.post(path, json=LIST_TOOLS, headers={**MCP_HEADERS, **headers})


@pytest.mark.parametrize(
    "headers",
    [{"Authorization": f"Bearer {KEY}"}, {"Authorization": f"bearer {KEY}"}, {"X-Api-Key": KEY}],
    ids=["bearer", "bearer-lowercase", "x-api-key"],
)
async def test_accepts_bearer_and_api_key_header(headers: dict[str, str]) -> None:
    response = await post_tools_list(make_app(make_settings()), headers)

    assert response.status_code == 200
    assert len(response.json()["result"]["tools"]) == 13


@pytest.mark.parametrize(
    "headers",
    [{}, {"X-Api-Key": "fel"}, {"Authorization": "Bearer fel"}, {"Authorization": KEY}],
    ids=["missing", "wrong-api-key", "wrong-bearer", "not-bearer"],
)
async def test_rejects_missing_or_wrong_key(headers: dict[str, str]) -> None:
    response = await post_tools_list(make_app(make_settings()), headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert "API-nyckel" in response.json()["error"]["message"]


async def test_fails_closed_when_no_key_is_configured() -> None:
    response = await post_tools_list(make_app(make_settings(mcp_api_keys=[])), {"X-Api-Key": KEY})

    assert response.status_code == 503
    assert "MCP_API_KEYS" in response.json()["error"]["message"]


async def test_any_configured_key_works_during_rotation() -> None:
    settings = make_settings(mcp_api_keys=[SecretStr("gammal-nyckel"), SecretStr("ny-nyckel")])

    for key in ("gammal-nyckel", "ny-nyckel"):
        response = await post_tools_list(make_app(settings), {"X-Api-Key": key})
        assert response.status_code == 200


@pytest.mark.parametrize("path", ["/mcp", "/mcp/"])
async def test_both_paths_answer_without_redirect(path: str) -> None:
    # httpx does not follow redirects by default, so a 307 would show up here.
    response = await post_tools_list(make_app(make_settings()), {"X-Api-Key": KEY}, path=path)

    assert response.status_code == 200
    assert "location" not in response.headers


async def test_get_is_refused_instead_of_opening_an_idle_stream() -> None:
    async with http_client(make_app(make_settings())) as http:
        response = await http.get("/mcp", headers={"X-Api-Key": KEY, "Accept": "text/event-stream"})

    assert response.status_code == 405
    assert response.headers["allow"] == "POST"


async def test_accepts_the_public_host_and_rejects_unknown_hosts() -> None:
    public = await post_tools_list(make_app(make_settings()), {"X-Api-Key": KEY}, base_url=PUBLIC_URL)
    unknown = await post_tools_list(
        make_app(make_settings()), {"X-Api-Key": KEY}, base_url="http://evil.example"
    )

    assert public.status_code == 200
    assert unknown.status_code == 421


async def test_configured_extra_host_is_accepted() -> None:
    # Eneo on the same Dokploy network calls the service by name, which PUBLIC_URL does not cover.
    service = "http://anbudsklar-app:3001"
    default = await post_tools_list(make_app(make_settings()), {"X-Api-Key": KEY}, base_url=service)
    configured = await post_tools_list(
        make_app(make_settings(mcp_allowed_hosts=["anbudsklar-app"])), {"X-Api-Key": KEY}, base_url=service
    )

    assert default.status_code == 421
    assert configured.status_code == 200


def test_disabled_mcp_serves_nothing() -> None:
    assert build_mcp(make_settings(mcp_enabled=False)).routes == []
