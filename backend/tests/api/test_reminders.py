"""Reminders: derived due dates, own rows only."""

from __future__ import annotations

from datetime import datetime, time, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.services.dates import STOCKHOLM

from .factories import Demo, add_checklist, add_document, add_notice, demo_checklist, login


def _local(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(STOCKHOLM)


async def test_derived_reminders_are_two_days_before_at_eight(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "foretagare")
    url = f"/api/notices/{demo.notice.id}/reminders"
    question = await client.post(url, json={"kind": "fragestopp", "note": "Fråga om ställning"})
    assert question.status_code == 201, question.text
    body = question.json()
    assert body["notice_title"] == demo.notice.title
    assert body["note"] == "Fråga om ställning"
    due = _local(body["due_at"])
    assert due.date() == demo.fragestopp - timedelta(days=2)
    assert due.time() == time(8, 0)

    deadline = (await client.post(url, json={"kind": "sista_anbudsdag"})).json()
    assert _local(deadline["due_at"]).date() == demo.deadline - timedelta(days=2)

    again = (await client.post(url, json={"kind": "fragestopp"})).json()
    assert again["id"] == body["id"]
    assert len((await client.get("/api/reminders")).json()) == 2


async def test_own_reminders(client: httpx.AsyncClient, demo: Demo) -> None:
    url = f"/api/notices/{demo.notice.id}/reminders"
    due_at = (datetime.now(STOCKHOLM) + timedelta(days=3)).isoformat()
    assert (await client.post(url, json={"kind": "egen", "due_at": due_at})).status_code == 401

    await login(client, "inkopare")
    buyer_reminder = (await client.post(url, json={"kind": "egen", "due_at": due_at})).json()

    await login(client, "foretagare")
    assert (await client.get("/api/reminders")).json() == []
    assert (await client.delete(f"/api/reminders/{buyer_reminder['id']}")).status_code == 404

    own = (await client.post(url, json={"kind": "egen", "due_at": due_at, "note": "Ring Lars"})).json()
    assert [item["id"] for item in (await client.get("/api/reminders")).json()] == [own["id"]]
    assert (await client.delete(f"/api/reminders/{own['id']}")).status_code == 204
    assert (await client.get("/api/reminders")).json() == []


async def test_reminder_input_is_checked(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await login(client, "foretagare")
    url = f"/api/notices/{demo.notice.id}/reminders"
    missing = await client.post(url, json={"kind": "egen"})
    assert missing.status_code == 422
    past = (datetime.now(STOCKHOLM) - timedelta(hours=1)).isoformat()
    assert (await client.post(url, json={"kind": "egen", "due_at": past})).status_code == 422

    notice = await add_notice(db_session, external_id="TEST-NO-CHECKLIST")
    document = await add_document(db_session, notice, ["Underlag utan datum."])
    await add_checklist(
        db_session, notice, document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    unpublished = await client.post(f"/api/notices/{notice.id}/reminders", json={"kind": "fragestopp"})
    assert unpublished.status_code == 422
    assert "publicerade checklistan" in unpublished.json()["detail"]
