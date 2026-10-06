"""The company profile, CPV search and CPV suggestions."""

from __future__ import annotations

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from .factories import Demo, add_cpv_codes, login

CPV = {
    "45442100": "Målning",
    "45442110": "Målning av byggnader",
    "45442120": "Målning och skyddsbeläggning av konstruktioner",
    "90911200": "Byggnadsrengöring",
}


async def test_profile_is_for_company_users_only(client: httpx.AsyncClient, demo: Demo) -> None:
    assert (await client.get("/api/profile")).status_code == 401
    await login(client, "inkopare")
    assert (await client.get("/api/profile")).status_code == 403


async def test_company_reads_and_updates_its_own_profile(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, CPV)
    await login(client, "foretagare")
    profile = (await client.get("/api/profile")).json()
    assert profile["id"] == str(demo.company.id)
    assert profile["cpv_labels"] == {"45442100": "Målning"}

    update = {
        "description": "  Vi målar skolor och förskolor invändigt och utvändigt.  ",
        "cpv_codes": ["45442110-1", "45442100", "45442110"],
        "municipalities": ["Sundsvall", " Timrå ", "Sundsvall", ""],
        "employees": 5,
        "insurance": "Ansvarsförsäkring 10 mnkr",
        "public_references": "  ",
    }
    response = await client.put("/api/profile", json=update)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["description"] == "Vi målar skolor och förskolor invändigt och utvändigt."
    assert body["cpv_codes"] == ["45442110", "45442100"]
    assert body["municipalities"] == ["Sundsvall", "Timrå"]
    assert body["public_references"] is None
    assert body["cpv_labels"]["45442110"] == "Målning av byggnader"

    await db_session.refresh(demo.other_company)
    assert demo.other_company.cpv_codes == ["90911200"]


async def test_saving_the_profile_says_how_many_open_notices_fit_it_now(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """With the heuristic engine the matches are re-assessed before the answer (the save toast's count)."""

    await add_cpv_codes(db_session, CPV)
    await login(client, "foretagare")
    painting = {"description": "Vi målar skolor och förskolor invändigt.", "cpv_codes": ["45442100"]}

    saved = await client.put("/api/profile", json=painting)
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["fitting_notices"] == 1
    assert body["cpv_codes"] == ["45442100"]  # still the whole profile, as before
    [match] = (await client.get("/api/matches")).json()
    assert match["notice"]["id"] == str(demo.notice.id)

    assert (await client.post(f"/api/matches/{match['id']}/dismiss")).status_code == 204
    assert (await client.put("/api/profile", json=painting)).json()["fitting_notices"] == 0  # not interested

    cleaning = {"description": "Vi städar kontor och lager.", "cpv_codes": ["90911200"]}
    assert (await client.put("/api/profile", json=cleaning)).json()["fitting_notices"] == 0
    assert (await client.get("/api/matches")).json() == []


async def test_profile_rejects_unknown_and_malformed_codes(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, CPV)
    await login(client, "foretagare")
    unknown = await client.put("/api/profile", json={"description": "Måleri", "cpv_codes": ["12345678"]})
    assert unknown.status_code == 422
    assert "12345678" in unknown.json()["detail"]
    malformed = await client.put("/api/profile", json={"description": "Måleri", "cpv_codes": ["4544"]})
    assert malformed.status_code == 422


async def test_cpv_search_is_public(client: httpx.AsyncClient, db_session: AsyncSession) -> None:
    await add_cpv_codes(db_session, CPV)
    response = await client.get("/api/cpv", params={"q": "målning"})
    assert response.status_code == 200
    codes = {hit["code"] for hit in response.json()}
    assert "45442100" in codes
    assert "90911200" not in codes
    assert (await client.get("/api/cpv", params={"q": "m"})).status_code == 422


async def test_cpv_suggestions_only_contain_codes_from_our_search(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, CPV)
    await login(client, "foretagare")
    response = await client.post(
        "/api/profile/cpv-suggestions", json={"description": "Vi utför målning av byggnader och fasader."}
    )
    assert response.status_code == 200, response.text
    suggestions = response.json()["suggestions"]["suggestions"]
    assert suggestions
    assert {item["code"] for item in suggestions} <= set(CPV)
    assert all(item["label"] == CPV[item["code"]] for item in suggestions)
