"""The buyer's tools: checklist review, notices, documents, insights and jobs."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.models import ChecklistRecord, JobRun, Reminder
from anbudsklar.services import jobs
from anbudsklar.services.jobs import JobContext
from anbudsklar.services.reminders import planned_due_at

from .factories import Demo, add_checklist, add_document, add_notice, demo_checklist, login


async def test_admin_requires_a_buyer(client: httpx.AsyncClient, demo: Demo) -> None:
    assert (await client.get("/api/admin/checklists")).status_code == 401
    await login(client, "foretagare")
    assert (await client.get("/api/admin/checklists")).status_code == 403
    assert (await client.post("/api/admin/jobs/match_all/run")).status_code == 403


async def test_checklist_queue(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")
    items = (await client.get("/api/admin/checklists")).json()
    assert [item["id"] for item in items] == [str(demo.checklist.id)]
    assert items[0]["requirement_count"] == 2
    assert items[0]["notice_title"] == demo.notice.title
    assert (await client.get("/api/admin/checklists", params={"status": "draft"})).json() == []


async def test_approve_then_publish(client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo) -> None:
    draft = await add_checklist(
        db_session, demo.notice, demo.document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    await login(client, "inkopare")
    base = f"/api/admin/checklists/{draft.id}"
    early = await client.post(f"{base}/publish")
    assert early.status_code == 409
    assert "godkännas" in early.json()["detail"]

    approved = (await client.post(f"{base}/approve")).json()
    assert approved["status"] == "approved"
    assert approved["approved_at"] is not None
    published = (await client.post(f"{base}/publish")).json()
    assert published["status"] == "published"

    await client.post("/api/session/logout")
    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert detail["checklist"]["id"] == str(draft.id)


async def test_reject_with_a_note(client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo) -> None:
    draft = await add_checklist(
        db_session, demo.notice, demo.document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    await login(client, "inkopare")
    base = f"/api/admin/checklists/{draft.id}"
    assert (await client.post(f"{base}/reject", json={"note": "x"})).status_code == 422
    rejected = (await client.post(f"{base}/reject", json={"note": "Saknar krav på F-skatt."})).json()
    assert rejected["status"] == "rejected"
    assert rejected["reviewer_note"] == "Saknar krav på F-skatt."
    assert (await client.post(f"{base}/approve")).status_code == 409


async def test_edits_are_verified_again_and_need_a_new_approval(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    draft = await add_checklist(
        db_session,
        demo.notice,
        demo.document,
        demo_checklist(demo.fragestopp, demo.deadline),
        status="approved",
    )
    edited = demo_checklist(demo.fragestopp, demo.deadline).model_dump(mode="json")
    edited["requirements"][1]["citation"]["quote"] = "Anbudsgivaren ska vara certifierad enligt ISO 9001."
    await login(client, "inkopare")
    response = await client.put(
        f"/api/admin/checklists/{draft.id}",
        json={"checklist": edited, "reviewer_note": "Lade till ISO-krav."},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "draft"
    assert body["approved_at"] is None
    checks = [requirement["citation"]["check"] for requirement in body["checklist"]["requirements"]]
    assert checks == ["verified", "unverified"]
    assert body["verification"]["citations_unverified"] == 1
    assert body["verification"]["citations_verified"] >= 1

    published = await client.put(
        f"/api/admin/checklists/{demo.checklist.id}", json={"checklist": edited, "reviewer_note": None}
    )
    assert published.status_code == 409


async def test_create_notice_and_upload_a_document_that_is_interpreted(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await login(client, "inkopare")
    deadline = (datetime.now(UTC) + timedelta(days=40)).isoformat()
    created = await client.post(
        "/api/admin/notices",
        json={
            "title": "Snöröjning vid skolor (fiktiv)",
            "cpv_codes": ["90620000-9"],
            "deadline_at": deadline,
        },
    )
    assert created.status_code == 201, created.text
    notice = created.json()
    assert notice["source"] == "manual"
    assert notice["status"] == "open"
    assert notice["cpv_codes"] == ["90620000"]

    content = (
        "Administrativa föreskrifter (fiktivt)\n\n"
        "Anbudsgivaren ska ha F-skattsedel. Anbudsgivaren ska bifoga intyg om ansvarsförsäkring.\n\n"
        "Anbud ska ha kommit in senast 2026-12-01."
    ).encode()
    upload = await client.post(
        f"/api/admin/notices/{notice['id']}/documents",
        files={"file": ("snorojning.txt", content, "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    document = upload.json()
    assert document["filename"] == "snorojning.txt"
    assert document["page_count"] >= 1

    record = await db_session.scalar(
        select(ChecklistRecord).where(ChecklistRecord.document_id == document["id"])
    )
    assert record is not None, "interpretation should run right after the upload"
    assert record.status == "draft"

    again = await client.post(
        f"/api/admin/notices/{notice['id']}/documents", files={"file": ("kopia.txt", content, "text/plain")}
    )
    assert again.json()["id"] == document["id"]
    records = (
        await db_session.scalars(select(ChecklistRecord).where(ChecklistRecord.document_id == document["id"]))
    ).all()
    assert len(records) == 1


async def test_insights_hide_questions_until_the_deadline(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    url = f"/api/notices/{demo.notice.id}/questions"
    await client.post(url, json={"question": "Vilken ansvarsförsäkring krävs?"})
    await client.post(url, json={"question": "Får vi använda underleverantörer till byggställningar?"})

    await login(client, "inkopare")
    [item] = (await client.get("/api/admin/insights")).json()
    assert item["question_count"] == 2
    assert item["visible"] is False
    assert item["sample_questions"] == []

    demo.notice.deadline_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()
    [item] = (await client.get("/api/admin/insights")).json()
    assert item["visible"] is True
    assert set(item["sample_questions"]) == {
        "Vilken ansvarsförsäkring krävs?",
        "Får vi använda underleverantörer till byggställningar?",
    }
    assert "company" not in str(item)


@pytest.fixture
def fake_jobs(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    async def works(session: AsyncSession, context: JobContext) -> Mapping[str, int]:
        calls.append("match_all")
        return {"assessed": 3}

    async def breaks(session: AsyncSession, context: JobContext) -> Mapping[str, int]:
        raise RuntimeError("TED svarade inte")

    monkeypatch.setitem(jobs.JOBS, "match_all", works)
    monkeypatch.setitem(jobs.JOBS, "ingest_ted", breaks)
    return calls


async def test_jobs_run_in_the_background_with_bookkeeping(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo, fake_jobs: list[str]
) -> None:
    await login(client, "inkopare")
    started = await client.post("/api/admin/jobs/match_all/run")
    assert started.status_code == 202
    assert started.json()["status"] == "running"
    assert fake_jobs == ["match_all"]

    failed = await client.post("/api/admin/jobs/ingest_ted/run")
    assert failed.status_code == 202

    runs = {run["job"]: run for run in (await client.get("/api/admin/jobs")).json()}
    assert runs["match_all"]["status"] == "ok"
    assert runs["match_all"]["stats"] == {"assessed": 3}
    assert runs["match_all"]["finished_at"] is not None
    assert runs["ingest_ted"]["status"] == "failed"
    # Only our own Swedish error text is shown; anything else stays in the log.
    assert runs["ingest_ted"]["error"] == "Tekniskt fel (RuntimeError). Detaljerna finns i loggen."

    assert (await client.post("/api/admin/jobs/drop_tables/run")).status_code == 422
    assert (await client.post("/api/admin/jobs/close_expired/run")).status_code == 202


async def test_jobs_list_the_latest_run_of_every_job(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    now = datetime.now(UTC)
    db_session.add_all(
        [
            JobRun(job="ingest_lou", status="ok", started_at=now - timedelta(days=6), stats={}),
            JobRun(job="ingest_lou", status="failed", started_at=now - timedelta(days=13), stats={}),
            *(
                JobRun(job="send_reminders", status="ok", started_at=now - timedelta(minutes=m), stats={})
                for m in range(1, 80)
            ),
        ]
    )
    await db_session.flush()
    await login(client, "inkopare")
    runs = (await client.get("/api/admin/jobs")).json()
    assert [run["job"] for run in runs] == ["send_reminders", "ingest_lou"]  # newest first
    assert runs[1]["status"] == "ok"  # the weekly job is still listed, with its latest run


async def test_a_running_job_is_not_started_twice(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo, fake_jobs: list[str]
) -> None:
    db_session.add(JobRun(job="match_all", status="running", started_at=datetime.now(UTC), stats={}))
    await db_session.flush()
    await login(client, "inkopare")
    response = await client.post("/api/admin/jobs/match_all/run")
    assert response.status_code == 409
    assert fake_jobs == []


async def test_a_published_checklist_can_be_withdrawn_corrected_and_published_again(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    earlier_fragestopp = demo.fragestopp - timedelta(days=5)
    earlier = await add_checklist(
        db_session, demo.notice, demo.document, demo_checklist(earlier_fragestopp, demo.deadline)
    )
    earlier.published_at = datetime.now(UTC) - timedelta(days=2)
    demo.checklist.published_at = datetime.now(UTC) - timedelta(days=1)
    reminder = Reminder(
        user_id=demo.company_user.id,
        notice_id=demo.notice.id,
        kind="fragestopp",
        due_at=planned_due_at(demo.fragestopp),
    )
    db_session.add(reminder)
    await db_session.flush()
    touched = demo.notice.updated_at

    await login(client, "inkopare")
    base = f"/api/admin/checklists/{demo.checklist.id}"
    assert (await client.post(f"{base}/withdraw", json={"note": "x"})).status_code == 422
    withdrawn = await client.post(f"{base}/withdraw", json={"note": "Fel datum för frågestopp."})
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["status"] == "rejected"
    assert withdrawn.json()["reviewer_note"] == "Fel datum för frågestopp."
    assert (await client.post(f"{base}/withdraw", json={"note": "Igen, igen."})).status_code == 409
    assert demo.notice.updated_at > touched  # matches are assessed again
    assert reminder.due_at == planned_due_at(earlier_fragestopp)  # follows the checklist now shown

    await client.post("/api/session/logout")
    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert detail["checklist"]["id"] == str(earlier.id)

    await login(client, "inkopare")
    corrected = demo_checklist(demo.fragestopp, demo.deadline).model_dump(mode="json")
    edited = await client.put(base, json={"checklist": corrected, "reviewer_note": "Rättat."})
    assert edited.json()["status"] == "draft"
    assert edited.json()["published_at"] is None
    await client.post(f"{base}/approve")
    assert (await client.post(f"{base}/publish")).json()["status"] == "published"
    assert reminder.due_at == planned_due_at(demo.fragestopp)


async def test_drafts_cannot_be_withdrawn(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    draft = await add_checklist(
        db_session, demo.notice, demo.document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    await login(client, "inkopare")
    response = await client.post(
        f"/api/admin/checklists/{draft.id}/withdraw", json={"note": "Inte publicerad."}
    )
    assert response.status_code == 409


async def test_failed_interpretations_are_listed_and_can_be_run_again(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    notice = await add_notice(db_session, title="Snöröjning (fiktiv)", external_id="TEST-I")
    pages = ["Kvalificering\nAnbudsgivaren ska ha F-skattsedel. Anbudsgivaren ska bifoga referenser."]
    document = await add_document(db_session, notice, pages, filename="snorojning.txt")
    document.interpret_attempts = 5
    document.interpret_error = "Underlaget är för stort för språkmodellen i Eneo."
    await db_session.flush()

    await login(client, "inkopare")
    [item] = (await client.get("/api/admin/interpretations")).json()
    assert item["document_id"] == str(document.id)
    assert item["notice_title"] == "Snöröjning (fiktiv)"
    assert item["state"] == "failed"
    assert item["error"] == "Underlaget är för stort för språkmodellen i Eneo."

    started = await client.post(f"/api/admin/documents/{document.id}/interpret")
    assert started.status_code == 202, started.text
    assert started.json()["state"] == "pending"
    record = await db_session.scalar(
        select(ChecklistRecord).where(ChecklistRecord.document_id == document.id)
    )
    assert record is not None and record.status == "draft"
    assert document.interpret_attempts == 0
    assert (await client.get("/api/admin/interpretations")).json() == []

    again = await client.post(f"/api/admin/documents/{demo.document.id}/interpret")
    assert again.status_code == 202  # a new draft next to the published checklist
    drafts = (await client.get("/api/admin/checklists", params={"status": "draft"})).json()
    assert {draft["notice_id"] for draft in drafts} == {str(notice.id), str(demo.notice.id)}


async def test_manual_notices_only_link_to_web_addresses(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")
    bad = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "url": "javascript:alert(1)"}
    )
    assert bad.status_code == 422
    too_many = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "cpv_codes": ["90620000"] * 31}
    )
    assert too_many.status_code == 422
    good = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "url": " https://www.e-avrop.com/x "}
    )
    assert good.status_code == 201
    assert good.json()["url"] == "https://www.e-avrop.com/x"


async def test_the_buyer_persona_can_be_turned_off(
    client: httpx.AsyncClient, app: FastAPI, demo: Demo
) -> None:
    await login(client, "inkopare")
    app.state.buyer_persona_enabled = False
    assert (await client.get("/api/admin/checklists")).status_code == 403  # an existing session too

    personas = (await client.get("/api/session")).json()["personas"]
    assert [persona["key"] for persona in personas] == ["foretagare"]
    refused = await client.post("/api/session/login", json={"persona": "inkopare"})
    assert refused.status_code == 403
    assert "avstängd" in refused.json()["detail"]
    assert (await client.post("/api/session/login", json={"persona": "foretagare"})).status_code == 200
