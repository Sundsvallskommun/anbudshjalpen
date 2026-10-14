"""Changing the profile from Fråga AI: the engine reads the wish, the app saves it and lists the tools."""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineRun
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.contracts import ProfileChange

from .factories import Demo, add_cpv_codes, login

CPV = {"45442100": "Målning", "45442180": "Ommålning", "45443000": "Fasadarbeten"}
CHAT = "/api/profile/chat"


async def test_the_chat_is_for_company_users_only(client: httpx.AsyncClient, demo: Demo) -> None:
    body = {"message": "Vi har tolv anställda.", "history": []}
    assert (await client.post(CHAT, json=body)).status_code == 401
    await login(client, "inkopare")
    assert (await client.post(CHAT, json=body)).status_code == 403


async def test_a_message_changes_the_profile_and_lists_what_was_done(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, CPV)
    await login(client, "foretagare")

    response = await client.post(
        CHAT, json={"message": "Vi har numera tolv anställda och gör även fasadarbeten.", "history": []}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["applied"] is True
    assert body["reply"] == "Jag uppdaterar antal anställda och CPV-koderna i er profil."
    assert [(item["label"], item["before"], item["after"]) for item in body["changes"]] == [
        ("CPV-koder", "45442100 Målning", "45442100 Målning, 45443000 Fasadarbeten"),
        ("Antal anställda", None, "12"),
    ]
    assert body["profile"]["employees"] == 12
    assert body["profile"]["cpv_codes"] == ["45442100", "45443000"]
    assert body["fitting_notices"] == 1  # the heuristic engine re-assesses the matches before the answer
    assert [tool["name"] for tool in body["tools"]] == [
        "hamta_profil",
        "sok_cpv",
        "tolka_meddelande",
        "spara_profil",
        "bedom_matchning",
    ]
    assert body["tools"][-1] == {
        "name": "bedom_matchning",
        "label": "Bedöm upphandlingarna på nytt",
        "detail": "1 verkar passa",
    }

    profile = (await client.get("/api/profile")).json()
    assert (profile["employees"], profile["cpv_codes"]) == (12, ["45442100", "45443000"])


async def test_an_unclear_message_saves_nothing(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await login(client, "foretagare")
    before = (await client.get("/api/profile")).json()
    response = await client.post(CHAT, json={"message": "Hej, vad kan ni göra?", "history": []})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["applied"] is False
    assert body["changes"] == [] and body["profile"] is None and body["fitting_notices"] is None
    assert body["reply"].startswith("Jag förstod inte vad som ska ändras")
    assert [tool["name"] for tool in body["tools"]] == ["hamta_profil", "sok_cpv", "tolka_meddelande"]
    assert (await client.get("/api/profile")).json() == before


class InventingEngine(HeuristicEngine):
    """A model that adds a code our search never offered, next to a change that holds."""

    async def update_profile(self, *args: Any, **kwargs: Any) -> tuple[ProfileChange, EngineRun]:
        change = ProfileChange(reply="Jag lägger till städning.", cpv_add=["90911200"], employees=3)
        return change, EngineRun(engine="heuristic", tools=["sla_upp_cpv"])


async def test_codes_the_search_did_not_offer_are_dropped_and_the_engines_tools_are_listed(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo, engine: HeuristicEngine
) -> None:
    await add_cpv_codes(db_session, {**CPV, "90911200": "Byggnadsrengöring"})
    await login(client, "foretagare")
    engine.__class__ = InventingEngine

    body = (await client.post(CHAT, json={"message": "Vi städar också.", "history": []})).json()
    assert body["applied"] is True
    assert [(item["field"], item["after"]) for item in body["changes"]] == [("employees", "3")]
    assert body["profile"]["cpv_codes"] == ["45442100"]
    assert "sla_upp_cpv" in [tool["name"] for tool in body["tools"]]


async def test_the_message_is_validated(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "foretagare")
    assert (await client.post(CHAT, json={"message": "Hi", "history": []})).status_code == 422
