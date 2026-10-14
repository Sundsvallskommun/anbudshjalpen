"""The buyer's tools: checklist review, notices, documents, insights and jobs."""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.models import AiCall, ChecklistRecord, Document, JobRun, Reminder
from anbudsklar.services import jobs
from anbudsklar.services.checklists import interpret_changed
from anbudsklar.services.dates import end_of_local_day
from anbudsklar.services.jobs import JobContext
from anbudsklar.services.reminders import planned_due_at

from .factories import (
    Demo,
    add_checklist,
    add_document,
    add_notice,
    demo_checklist,
    document_pages,
    login,
)


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
    assert datetime.fromisoformat(items[0]["deadline_at"]) == demo.notice.deadline_at
    assert (await client.get("/api/admin/checklists", params={"status": "draft"})).json() == []


async def test_the_queue_is_sorted_on_the_tender_deadline(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    soon = await add_notice(
        db_session,
        title="Snöröjning (fiktiv)",
        external_id="TEST-Q1",
        deadline_at=datetime.now(UTC) + timedelta(days=3),
    )
    undated = await add_notice(db_session, title="Fönsterputs (fiktiv)", external_id="TEST-Q2")
    pages = document_pages(demo.fragestopp, demo.deadline)
    checklist = demo_checklist(demo.fragestopp, demo.deadline)
    later = await add_checklist(
        db_session, undated, await add_document(db_session, undated, pages), checklist
    )
    first = await add_checklist(
        db_session, soon, await add_document(db_session, soon, pages), checklist, status="draft"
    )
    await login(client, "inkopare")
    items = (await client.get("/api/admin/checklists")).json()
    assert [item["id"] for item in items] == [str(first.id), str(demo.checklist.id), str(later.id)]
    assert items[-1]["deadline_at"] is None


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


async def test_a_rejected_checklist_is_never_approved_until_it_is_opened_as_a_draft_again(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    draft = await add_checklist(
        db_session, demo.notice, demo.document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    await login(client, "inkopare")
    base = f"/api/admin/checklists/{draft.id}"
    assert (await client.post(f"{base}/reopen")).status_code == 409  # only a rejected one
    await client.post(f"{base}/reject", json={"note": "Saknar krav på F-skatt."})

    refused = await client.post(f"{base}/approve")
    assert refused.status_code == 409
    assert "avvisad checklista kan inte godkännas" in refused.json()["detail"]
    unpublished = await client.post(f"{base}/publish")
    assert unpublished.status_code == 409
    assert "avvisad checklista kan inte publiceras" in unpublished.json()["detail"]

    reopened = await client.post(f"{base}/reopen")
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "draft"
    assert (
        reopened.json()["reviewer_note"] == "Saknar krav på F-skatt."
    )  # why it was rejected, until replaced
    assert (await client.post(f"{base}/reopen")).status_code == 409
    assert (await client.post(f"{base}/approve")).json()["status"] == "approved"
    already = await client.post(f"{base}/approve")
    assert (already.status_code, already.json()["detail"]) == (409, "Checklistan är redan godkänd.")


async def test_a_withdrawn_checklist_reopens_as_an_unpublished_draft(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await login(client, "inkopare")
    base = f"/api/admin/checklists/{demo.checklist.id}"
    assert (await client.post(f"{base}/reopen")).status_code == 409  # published: withdraw it first
    await client.post(f"{base}/withdraw", json={"note": "Fel datum för frågestopp."})
    reopened = (await client.post(f"{base}/reopen")).json()
    assert (reopened["status"], reopened["approved_at"], reopened["published_at"]) == ("draft", None, None)
    assert reopened["reviewer_note"] == "Fel datum för frågestopp."

    await client.post("/api/session/logout")
    assert (await client.get(f"/api/notices/{demo.notice.id}")).json()["checklist"] is None  # still not shown
    await login(client, "foretagare")
    assert (await client.post(f"{base}/reopen")).status_code == 403


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

    # A later upload is an attachment (decision 0020): no checklist of its own, but the notice is
    # interpreted again with it by the worker.
    attachment = await client.post(
        f"/api/admin/notices/{notice['id']}/documents",
        files={
            "file": (
                "kravspecifikation.txt",
                "Leverantören ska vara certifierad enligt ISO 14001.".encode(),
                "text/plain",
            )
        },
    )
    assert attachment.status_code == 201, attachment.text
    assert (
        await db_session.scalar(
            select(ChecklistRecord).where(ChecklistRecord.document_id == attachment.json()["id"])
        )
        is None
    )
    stored = await db_session.get(Document, uuid.UUID(attachment.json()["id"]))
    assert stored is not None and stored.auto_interpret is False
    assert (await interpret_changed(db_session, HeuristicEngine()))["reinterpreted"] == 1
    successor = await db_session.scalar(
        select(ChecklistRecord)
        .where(ChecklistRecord.notice_id == uuid.UUID(notice["id"]))
        .order_by(ChecklistRecord.created_at.desc())
    )
    assert successor is not None and successor.document_id == uuid.UUID(document["id"])
    assert any("ISO 14001" in item["citation"]["quote"] for item in successor.payload["requirements"])


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


async def test_insights_of_a_restricted_procedure_wait_for_sista_anbudsdag(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """Past the last day for anbudsansökan the tender period still runs, until the checklist's date."""

    await client.post(
        f"/api/notices/{demo.notice.id}/questions", json={"question": "Vilken försäkring krävs?"}
    )
    demo.notice.deadline_kind = "request"
    demo.notice.deadline_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()

    await login(client, "inkopare")
    [item] = (await client.get("/api/admin/insights")).json()
    assert item["visible"] is False
    assert item["sample_questions"] == []
    assert datetime.fromisoformat(item["deadline_at"]) == end_of_local_day(demo.deadline)

    demo.checklist.status = "approved"  # no published checklist: nobody knows when tenders close
    await db_session.flush()
    [item] = (await client.get("/api/admin/insights")).json()
    assert (item["visible"], item["deadline_at"]) == (False, None)


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


async def test_manual_notices_keep_the_buyers_reference_number(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")
    numbered = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "reference_number": " KS 2026/0147 "}
    )
    assert numbered.status_code == 201, numbered.text
    assert numbered.json()["reference_number"] == "KS 2026/0147"
    blank = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "reference_number": " "}
    )
    assert blank.json()["reference_number"] is None
    unnumbered = await client.post("/api/admin/notices", json={"title": "Snöröjning (fiktiv)"})
    assert unnumbered.json()["reference_number"] is None


async def test_manual_notices_say_what_their_deadline_is_for(client: httpx.AsyncClient, demo: Demo) -> None:
    await login(client, "inkopare")
    deadline = (datetime.now(UTC) + timedelta(days=20)).isoformat()
    request = await client.post(
        "/api/admin/notices",
        json={"title": "Fasadrenovering (fiktiv)", "deadline_at": deadline, "deadline_kind": "request"},
    )
    assert request.status_code == 201, request.text
    assert request.json()["deadline_kind"] == "request"
    tender = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "deadline_at": deadline}
    )
    assert tender.json()["deadline_kind"] == "tender"
    wrong = await client.post(
        "/api/admin/notices", json={"title": "Snöröjning (fiktiv)", "deadline_kind": "offer"}
    )
    assert wrong.status_code == 422


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


async def test_ai_usage_counts_the_calls_the_app_made(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """A visitor's question is one call; the heuristic engine reports no tokens and no price is set."""

    asked = await client.post(
        f"/api/notices/{demo.notice.id}/questions", json={"question": "Vilken ansvarsförsäkring krävs?"}
    )
    assert asked.status_code == 200, asked.text
    assert asked.json()["usage"] is None
    db_session.add(
        AiCall(
            task="tolka_underlag",
            engine="openai",
            model="gpt-x",
            input_tokens=120_000,
            output_tokens=3_000,
            attempts=1,
            notice_id=demo.notice.id,
            created_at=datetime.now(UTC) - timedelta(days=10),
        )
    )
    await db_session.flush()

    await login(client, "foretagare")
    assert (await client.get("/api/admin/ai-usage")).status_code == 403
    await login(client, "inkopare")
    assert (await client.get("/api/admin/ai-usage", params={"days": 0})).status_code == 422

    month = (await client.get("/api/admin/ai-usage")).json()
    assert (month["days"], month["calls"], month["calls_with_usage"]) == (30, 2, 1)
    assert (month["input_tokens"], month["output_tokens"], month["cost_sek"]) == (120_000, 3_000, None)
    assert (month["price_input_sek_per_million"], month["price_output_sek_per_million"]) == (None, None)
    assert [(item["task"], item["calls"], item["calls_with_usage"]) for item in month["by_task"]] == [
        ("tolka_underlag", 1, 1),
        ("besvara_fraga", 1, 0),
    ]
    assert [(item["engine"], item["model"]) for item in month["by_model"]] == [
        ("heuristic", None),
        ("openai", "gpt-x"),
    ]

    week = (await client.get("/api/admin/ai-usage", params={"days": 7})).json()
    assert (week["calls"], week["input_tokens"]) == (1, 0)
    assert [item["task"] for item in week["by_task"]] == ["besvara_fraga"]


async def test_possible_bidders_need_a_buyer_and_say_who_could_answer_a_job(
    client: httpx.AsyncClient, demo: Demo
) -> None:
    body = {"title": "Ommålning av Solbackens förskola", "cpv_codes": ["45442100-8"]}
    await login(client, "foretagare")
    assert (await client.post("/api/admin/suppliers/search", json=body)).status_code == 403

    await login(client, "inkopare")
    response = await client.post("/api/admin/suppliers/search", json=body)
    assert response.status_code == 200, response.text
    [item] = response.json()  # the cleaning company shares neither a group nor a word with the job
    assert item["name"] == demo.company.name
    assert item["cpv_match"]["kind"] == "same_code"
    assert item["shared_words"] == ["förskolor"]
    assert not {"description", "annual_turnover_sek", "insurance", "public_references"} & set(item)

    # Words alone are enough when two of the company's words are in the job.
    job = {"title": "Städning av kontor och lager"}
    by_words = (await client.post("/api/admin/suppliers/search", json=job)).json()
    assert [item["name"] for item in by_words] == [demo.other_company.name]
    assert by_words[0]["cpv_match"] is None

    assert (await client.post("/api/admin/suppliers/search", json={"title": " "})).status_code == 422
    assert (await client.post("/api/admin/suppliers/search", json={"cpv_codes": ["abc"]})).status_code == 422
