"""Matches (company-scoped) and upcoming procurements."""

from __future__ import annotations

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.services.dates import add_months
from anbudsklar.services.matching import match_all

from .factories import Demo, add_agreement, add_notice, end_of_day, login, today


async def test_matches_are_scoped_to_the_company(
    client: httpx.AsyncClient, db_session: AsyncSession, engine: AiEngine, demo: Demo
) -> None:
    stats = await match_all(db_session, engine)
    assert stats["companies"] == 2
    assert stats["assessed"] == 1

    await login(client, "foretagare")
    matches = (await client.get("/api/matches")).json()
    assert [match["notice"]["id"] for match in matches] == [str(demo.notice.id)]
    match = matches[0]
    assert match["fit"] in {"passar", "passar_delvis", "passar_inte"}
    assert match["notice"]["fit"] == match["fit"]
    assert match["engine"] == "heuristic"  # provenance for the card; matches are never reviewed by inköp
    assert "språkmodell" not in match["assessment"]["summary"]

    await client.post("/api/session/logout")
    await login_as_other_company(client, db_session, demo)
    assert (await client.get("/api/matches")).json() == []
    assert (await client.post(f"/api/matches/{match['id']}/dismiss")).status_code == 404


async def login_as_other_company(client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo) -> None:
    """The persona picker always picks Anna; make Sara the first company user instead."""

    demo.company_user.role = "inkopare"
    await db_session.flush()
    await login(client, "foretagare")
    session = (await client.get("/api/session")).json()
    assert session["user"]["email"] == demo.other_user.email


async def test_dismissed_matches_disappear(
    client: httpx.AsyncClient, db_session: AsyncSession, engine: AiEngine, demo: Demo
) -> None:
    await match_all(db_session, engine)
    await login(client, "foretagare")
    [match] = (await client.get("/api/matches")).json()
    assert (await client.post(f"/api/matches/{match['id']}/dismiss")).status_code == 204
    assert (await client.get("/api/matches")).json() == []


async def test_a_dismissal_can_be_undone(
    client: httpx.AsyncClient, db_session: AsyncSession, engine: AiEngine, demo: Demo
) -> None:
    await match_all(db_session, engine)
    await login(client, "foretagare")
    [match] = (await client.get("/api/matches")).json()
    await client.post(f"/api/matches/{match['id']}/dismiss")
    assert (await client.post(f"/api/matches/{match['id']}/restore")).status_code == 204  # "Ångra"
    assert [item["id"] for item in (await client.get("/api/matches")).json()] == [match["id"]]

    await client.post("/api/session/logout")
    await login_as_other_company(client, db_session, demo)
    assert (await client.post(f"/api/matches/{match['id']}/restore")).status_code == 404


async def test_upcoming_procurements(client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo) -> None:
    painting_end = add_months(today(), 14)
    await add_agreement(
        db_session,
        external_id="AV-1",
        title="Ramavtal måleriarbeten (fiktivt)",
        end_date=painting_end,
        cpv_codes=["45442100"],
    )
    await add_agreement(
        db_session,
        external_id="AV-2",
        title="Kontorsmaterial (fiktivt)",
        end_date=add_months(today(), 30),
        cpv_codes=["30192000"],
    )
    await add_agreement(
        db_session,
        external_id="AV-3",
        title="Avslutat avtal (fiktivt)",
        end_date=add_months(today(), -1),
        cpv_codes=["45442100"],
    )

    anonymous = (await client.get("/api/upcoming")).json()
    assert [item["title"] for item in anonymous] == ["Ramavtal måleriarbeten (fiktivt)"]
    item = anonymous[0]
    assert item["expected_from"] == add_months(painting_end, -9).isoformat()
    assert item["expected_to"] == add_months(painting_end, -6).isoformat()
    assert item["relevant_for_company"] is False

    await login(client, "foretagare")
    signed_in = (await client.get("/api/upcoming", params={"months": 36})).json()
    relevant = {entry["title"]: entry["relevant_for_company"] for entry in signed_in}
    assert relevant == {"Ramavtal måleriarbeten (fiktivt)": True, "Kontorsmaterial (fiktivt)": False}
    assert (await client.get("/api/upcoming", params={"months": 0})).status_code == 422


async def test_upcoming_marks_late_windows_and_leaves_out_advertised_successors(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    late = await add_agreement(
        db_session,
        external_id="AV-4",
        title="Tolktjänster (fiktivt)",
        end_date=add_months(today(), 3),
        cpv_codes=["79540000"],
    )
    await add_agreement(
        db_session,
        external_id="AV-5",
        title="Lokalvård förskolor (fiktivt)",
        end_date=add_months(today(), 4),
        cpv_codes=["90911200", "90919300"],
    )
    await add_notice(
        db_session,
        title="Städtjänster för kommunens förskolor (fiktiv)",
        cpv_codes=["90911200", "90919300"],
        deadline_at=end_of_day(add_months(today(), 1)),
        external_id="TEST-S",
    )
    await add_agreement(
        db_session,
        external_id="AV-6",
        title="Ramavtal måleriarbeten (fiktivt)",
        end_date=add_months(today(), 4),
        cpv_codes=["45442100"],
    )

    items = {item["title"]: item for item in (await client.get("/api/upcoming")).json()}
    assert "Lokalvård förskolor (fiktivt)" not in items  # its successor is open for tenders
    assert items["Tolktjänster (fiktivt)"]["announcement_overdue"] is True
    assert items["Tolktjänster (fiktivt)"]["agreement_id"] == str(late.id)
    # Same kind of work as the open painting notice, but not its successor: no shared title word.
    assert items["Ramavtal måleriarbeten (fiktivt)"]["announcement_overdue"] is True


async def test_a_broad_profile_code_makes_specific_agreements_relevant(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    demo.company.cpv_codes = ["45000000"]
    await db_session.flush()
    await add_agreement(
        db_session,
        external_id="AV-7",
        title="Fasadrenovering (fiktivt)",
        end_date=add_months(today(), 12),
        cpv_codes=["45443000"],
    )
    await login(client, "foretagare")
    [item] = (await client.get("/api/upcoming")).json()
    assert item["relevant_for_company"] is True
    assert item["announcement_overdue"] is False
