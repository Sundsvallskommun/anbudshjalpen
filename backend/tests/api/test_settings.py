"""Run-time settings (decision 0011): inköp can turn the review before publishing off and on."""

from __future__ import annotations

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.services.checklists import interpret_document

from .factories import Demo, add_checklist, add_document, add_notice, login

PAGES = ["Kvalificering\nAnbudsgivaren ska ha F-skattsedel. Anbudsgivaren ska bifoga referenser."]


async def test_settings_are_for_buyers(client: httpx.AsyncClient, demo: Demo) -> None:
    assert (await client.get("/api/admin/settings")).status_code == 401
    await login(client, "foretagare")
    assert (await client.get("/api/admin/settings")).status_code == 403
    assert (await client.put("/api/admin/settings", json={"review_required": False})).status_code == 403


async def test_review_is_required_by_default(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")

    assert (await client.get("/api/admin/settings")).json() == {"review_required": True}


async def test_the_app_config_tells_everyone_whether_inkop_reviews(
    client: httpx.AsyncClient, demo: Demo
) -> None:
    """Companies never read the settings, but the words for a checklist follow the review (decision 0017)."""

    assert (await client.get("/api/config")).json()["review_required"] is True
    await login(client, "inkopare")
    await client.put("/api/admin/settings", json={"review_required": False})
    await client.post("/api/session/logout")

    assert (await client.get("/api/config")).json()["review_required"] is False


async def test_turning_the_review_off_publishes_what_waits_and_what_comes(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    waiting = await add_notice(db_session, title="Städning av skolor", external_id="TEST-2")
    waiting_document = await add_document(db_session, waiting, PAGES)
    draft = await add_checklist(db_session, waiting, waiting_document, demo_checklist(demo), status="draft")
    rejected_notice = await add_notice(db_session, title="Avvisad upphandling", external_id="TEST-3")
    rejected_document = await add_document(db_session, rejected_notice, PAGES)
    rejected = await add_checklist(
        db_session, rejected_notice, rejected_document, demo_checklist(demo), status="rejected"
    )
    await login(client, "inkopare")

    response = await client.put("/api/admin/settings", json={"review_required": False})

    assert response.status_code == 200, response.text
    assert response.json() == {"review_required": False, "published_now": 1}
    await db_session.refresh(draft)
    await db_session.refresh(rejected)
    assert draft.status == "published" and draft.published_at is not None and draft.approved_at is None
    assert rejected.status == "rejected"

    # A new interpretation is published at once, and the app says nobody reviewed it.
    fresh = await add_notice(db_session, title="Ny upphandling", external_id="TEST-4")
    fresh_document = await add_document(db_session, fresh, PAGES)
    record = await interpret_document(db_session, HeuristicEngine(), fresh_document.id)
    assert record.status == "published" and record.approved_at is None
    await client.post("/api/session/logout")
    notice = (await client.get(f"/api/notices/{fresh.id}")).json()
    assert (notice["checklist_status"], notice["checklist_reviewed"]) == ("published", False)
    assert notice["checklist"]["reviewed"] is False
    reviewed = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert (reviewed["checklist_status"], reviewed["checklist_reviewed"]) == ("published", True)

    # Turned on again, new interpretations wait for inköp; what was published stays.
    await login(client, "inkopare")
    assert (await client.put("/api/admin/settings", json={"review_required": True})).json() == {
        "review_required": True,
        "published_now": 0,
    }
    later = await add_notice(db_session, title="Senare upphandling", external_id="TEST-5")
    later_document = await add_document(db_session, later, PAGES)
    assert (await interpret_document(db_session, HeuristicEngine(), later_document.id)).status == "draft"
    await db_session.refresh(draft)
    assert draft.status == "published"


def demo_checklist(demo: Demo):
    from anbudsklar.services.checklists import checklist_payload

    return checklist_payload(demo.checklist)
