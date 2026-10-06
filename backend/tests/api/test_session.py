"""Configuration, persona login, the session cookie and the same-origin check."""

from __future__ import annotations

import httpx
from fastapi import FastAPI

from anbudsklar.api.security import SESSION_COOKIE, origin_of

from .factories import PUBLIC_URL, Demo, login


async def test_config_discloses_ai_and_the_demo(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/config")
    body = response.json()
    assert response.status_code == 200
    assert body["ai_engine"] == "heuristic"
    assert "AI kan ha fel" in body["ai_disclosure"]
    assert "fasta regler i stället för AI" in body["ai_disclosure"]  # says which engine, in plain words
    assert "språkmodell" not in body["ai_disclosure"]
    assert "Fiktiv" in body["demo_notice"]
    assert body["organization_name"] == "Sundsvalls kommun"
    assert body["eavrop_url"] == "https://www.e-avrop.com/sundsvall"  # the fallback link for notices


async def test_anonymous_session_lists_the_seeded_personas(client: httpx.AsyncClient, demo: Demo) -> None:
    response = await client.get("/api/session")
    body = response.json()
    assert body["user"] is None
    assert [persona["key"] for persona in body["personas"]] == ["foretagare", "inkopare"]
    assert body["personas"][0]["label"] == f"Anna Berg, {demo.company.name}"
    assert response.headers["cache-control"] == "no-store"


async def test_login_sets_an_opaque_httponly_lax_cookie(client: httpx.AsyncClient, demo: Demo) -> None:
    response = await client.post("/api/session/login", json={"persona": "foretagare"})
    assert response.status_code == 200
    assert response.json()["user"]["company"] == {"id": str(demo.company.id), "name": demo.company.name}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert str(demo.company_user.id) not in cookie

    session = (await client.get("/api/session")).json()
    assert session["user"]["email"] == "anna@example.test"
    assert session["user"]["role"] == "foretagare"


async def test_logout_revokes_the_session_on_the_server(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")
    token = client.cookies[SESSION_COOKIE]
    assert (await client.post("/api/session/logout")).status_code == 204
    assert (await client.get("/api/session")).json()["user"] is None

    replay = await client.get("/api/session", headers={"Cookie": f"{SESSION_COOKIE}={token}"})
    assert replay.json()["user"] is None


async def test_writes_from_another_origin_are_refused(
    client: httpx.AsyncClient, app: FastAPI, demo: Demo
) -> None:
    url = "/api/session/login"
    body = {"persona": "foretagare"}
    foreign = await client.post(url, json=body, headers={"Origin": "https://evil.example"})
    assert foreign.status_code == 403
    assert foreign.json()["detail"] == "Begäran kom inte från Anbudsklar."

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC_URL) as bare:
        assert (await bare.post(url, json=body)).status_code == 403
        referer = await bare.post(url, json=body, headers={"Referer": f"{PUBLIC_URL}/logga-in"})
        assert referer.status_code == 200


async def test_login_without_demo_data_explains_what_to_do(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/session/login", json={"persona": "inkopare"})
    assert response.status_code == 404
    assert "anbudsklar seed" in response.json()["detail"]


def test_origin_normalisation() -> None:
    assert origin_of("http://127.0.0.1:3502/x?y") == "http://127.0.0.1:3502"
    assert origin_of("HTTPS://Anbudsklar.Example:443/") == "https://anbudsklar.example"
    assert origin_of("null") is None
    assert origin_of("ftp://example.se") is None
