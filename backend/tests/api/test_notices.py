"""Notice list and detail, document pages and files, and questions about the document."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.store import store_document
from anbudsklar.models import MatchRecord, QuestionLog
from anbudsklar.services.dates import end_of_local_day

from .factories import (
    Demo,
    add_checklist,
    add_document,
    add_notice,
    demo_checklist,
    document_pages,
    login,
)


async def _match(session: AsyncSession, demo: Demo, fit: str = "passar") -> MatchRecord:
    record = MatchRecord(
        company_id=demo.company.id,
        notice_id=demo.notice.id,
        fit=fit,
        engine="heuristic",
        payload={"fit": fit, "summary": "Passar bra för målning.", "reasons": []},
    )
    session.add(record)
    await session.flush()
    return record


async def test_anonymous_list_shows_published_state_but_no_fit(client: httpx.AsyncClient, demo: Demo) -> None:
    response = await client.get("/api/notices")
    assert response.status_code == 200
    body = response.json()
    item = next(item for item in body["items"] if item["id"] == str(demo.notice.id))
    assert body["total"] >= 1
    assert item["checklist_status"] == "published"
    assert item["has_documents"] is True
    assert item["is_fictitious"] is True
    assert item["fit"] is None


async def test_company_sees_its_own_fit_only(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await _match(db_session, demo)
    await login(client, "foretagare")
    items = (await client.get("/api/notices")).json()["items"]
    assert next(item for item in items if item["id"] == str(demo.notice.id))["fit"] == "passar"

    await client.post("/api/session/logout")
    items = (await client.get("/api/notices")).json()["items"]
    assert next(item for item in items if item["id"] == str(demo.notice.id))["fit"] is None


async def test_list_filters_are_validated(client: httpx.AsyncClient, demo: Demo) -> None:
    assert (await client.get("/api/notices", params={"cpv": "45x"})).status_code == 422
    assert (await client.get("/api/notices", params={"status": "nonsense"})).status_code == 422
    filtered = await client.get("/api/notices", params={"cpv": "4544,7700", "status": "open"})
    assert filtered.status_code == 200
    assert str(demo.notice.id) in {item["id"] for item in filtered.json()["items"]}


async def test_companies_only_see_published_checklists_and_buyers_see_the_latest(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    draft = await add_checklist(
        db_session, demo.notice, demo.document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    url = f"/api/notices/{demo.notice.id}"

    anonymous = (await client.get(url)).json()
    assert anonymous["checklist"]["id"] == str(demo.checklist.id)
    assert anonymous["checklist"]["status"] == "published"
    assert anonymous["documents"][0]["page_count"] == 3

    await login(client, "inkopare")
    buyer = (await client.get(url)).json()
    assert buyer["checklist"]["id"] == str(draft.id)
    assert buyer["checklist_status"] == "draft"


async def test_detail_without_published_checklist(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    notice = await add_notice(db_session, title="Städtjänster (fiktiv)", external_id="TEST-2")
    document = await add_document(db_session, notice, document_pages(demo.fragestopp, demo.deadline))
    await add_checklist(
        db_session, notice, document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    body = (await client.get(f"/api/notices/{notice.id}")).json()
    assert body["checklist"] is None
    assert body["checklist_status"] == "none"
    assert (await client.get(f"/api/notices/{uuid.uuid4()}")).status_code == 404


async def test_match_is_shown_on_the_detail_for_the_company(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    record = await _match(db_session, demo, fit="passar_delvis")
    await login(client, "foretagare")
    body = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert body["match"]["id"] == str(record.id)
    assert body["match"]["assessment"]["summary"] == "Passar bra för målning."


async def test_page_view(client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo) -> None:
    base = f"/api/notices/{demo.notice.id}/documents/{demo.document.id}/pages"
    page = await client.get(f"{base}/2")
    assert page.status_code == 200
    assert page.json()["page_count"] == 3
    assert "ansvarsförsäkring" in page.json()["text"]
    assert (await client.get(f"{base}/9")).status_code == 404
    assert (await client.get(f"{base}/0")).status_code == 422

    other = await add_notice(db_session, external_id="TEST-3")
    wrong = await client.get(f"/api/notices/{other.id}/documents/{demo.document.id}/pages/1")
    assert wrong.status_code == 404


async def test_document_file_is_served_inline(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    data = "Förfrågningsunderlag (fiktivt)\n\nAnbud ska lämnas på svenska.".encode()
    document = await store_document(
        db_session, notice_id=demo.notice.id, filename="Underlag åäö.txt", mimetype="text/plain", data=data
    )
    response = await client.get(f"/api/documents/{document.id}/file")
    assert response.status_code == 200
    assert response.content == data
    assert response.headers["content-type"].startswith("text/plain")
    assert "filename*=UTF-8''Underlag%20%C3%A5%C3%A4%C3%B6.txt" in response.headers["content-disposition"]
    assert response.headers["x-content-type-options"] == "nosniff"

    missing = await client.get(f"/api/documents/{demo.document.id}/file")  # rows without a stored file
    assert missing.status_code == 404


async def test_anonymous_question_is_answered_with_verified_citations_and_logged_without_company(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    response = await client.post(
        f"/api/notices/{demo.notice.id}/questions", json={"question": "Vilken ansvarsförsäkring krävs?"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["engine"] == "heuristic"
    assert body["answer"]["citations"], body
    assert all(
        citation["check"] in {"verified", "moved", "unverified"} for citation in body["answer"]["citations"]
    )
    # Frågestopp is the last day for questions: it lasts until that day ends.
    assert body["question_deadline"] == end_of_local_day(demo.fragestopp).isoformat()
    assert body["document_id"] == str(demo.document.id)

    log = (await db_session.scalars(select(QuestionLog))).one()
    assert log.company_id is None
    assert log.question == "Vilken ansvarsförsäkring krävs?"
    assert log.found_in_document == body["answer"]["found_in_document"]


async def test_company_questions_are_logged_with_the_company_and_buyer_questions_are_not(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    url = f"/api/notices/{demo.notice.id}/questions"
    await login(client, "foretagare")
    assert (await client.post(url, json={"question": "Hur många referenser behövs?"})).status_code == 200
    await login(client, "inkopare")
    assert (await client.post(url, json={"question": "Testfråga från inköp"})).status_code == 200

    logs = (await db_session.scalars(select(QuestionLog))).all()
    assert [(log.company_id, log.question) for log in logs] == [
        (demo.company.id, "Hur många referenser behövs?")
    ]


async def test_question_needs_a_document_and_valid_input(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    notice = await add_notice(db_session, external_id="TEST-4", deadline_at=demo.notice.deadline_at)
    no_document = await client.post(
        f"/api/notices/{notice.id}/questions", json={"question": "Finns underlag?"}
    )
    assert no_document.status_code == 409
    assert "inget underlag" in no_document.json()["detail"]

    too_short = await client.post(f"/api/notices/{demo.notice.id}/questions", json={"question": "?"})
    assert too_short.status_code == 422


async def test_notice_list_offset_and_limit(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    for index in range(3):
        await add_notice(
            db_session,
            title=f"Fönsterputs {index} (fiktiv)",
            external_id=f"TEST-P{index}",
            deadline_at=demo.notice.deadline_at + timedelta(days=index + 1),
        )
    first = (await client.get("/api/notices", params={"limit": 2})).json()
    second = (await client.get("/api/notices", params={"limit": 2, "offset": 2})).json()
    assert first["total"] == second["total"] == 4
    assert len(first["items"]) == 2
    assert not {item["id"] for item in first["items"]} & {item["id"] for item in second["items"]}


async def test_formal_questions_always_have_somewhere_to_go(
    client: httpx.AsyncClient, app: FastAPI, db_session: AsyncSession, demo: Demo
) -> None:
    url = f"/api/notices/{demo.notice.id}/questions"
    question = {"question": "Får vi lämna anbud tillsammans med ett annat företag?"}
    body = (await client.post(url, json=question)).json()
    assert body["formal_question_url"] == app.state.settings.eavrop_base_url  # the notice has no link

    demo.notice.documents_url = "https://www.e-avrop.com/sundsvall/e-Upphandling/Notice.aspx?id=1"
    await db_session.flush()
    body = (await client.post(url, json=question)).json()
    assert body["formal_question_url"] == demo.notice.documents_url


async def test_answers_come_from_the_document_behind_the_published_checklist(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """A corrected document uploaded later, whose checklist is published, is the one read."""

    revised_pages = document_pages(demo.fragestopp, demo.deadline)
    revised_pages[1] = "Kvalificering\nAnbudsgivaren ska ha en ansvarsförsäkring om minst 10 miljoner kronor."
    revised = await add_document(db_session, demo.notice, revised_pages, filename="rattelse.txt")
    await add_checklist(db_session, demo.notice, revised, demo_checklist(demo.fragestopp, demo.deadline))

    body = (
        await client.post(
            f"/api/notices/{demo.notice.id}/questions", json={"question": "Vilken ansvarsförsäkring krävs?"}
        )
    ).json()
    assert body["document_id"] == str(revised.id)
    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert detail["checklist"]["document_id"] == body["document_id"]


async def test_questions_after_the_deadline_are_answered_but_not_logged(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    demo.notice.deadline_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()
    response = await client.post(
        f"/api/notices/{demo.notice.id}/questions", json={"question": "Vilken ansvarsförsäkring krävs?"}
    )
    assert response.status_code == 200
    assert (await db_session.scalars(select(QuestionLog))).all() == []


async def test_long_conversations_are_accepted(client: httpx.AsyncClient, demo: Demo) -> None:
    """The app sends up to ten earlier turns; the backend keeps the latest that fit."""

    history = [{"question": f"Fråga {index}?", "answer": "Svar. " * 1_300} for index in range(10)]
    response = await client.post(
        f"/api/notices/{demo.notice.id}/questions",
        json={"question": "Vilka bilagor ska vara med?", "history": history},
    )
    assert response.status_code == 200, response.text


async def test_an_open_notice_past_its_deadline_is_shown_as_closed(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    demo.notice.deadline_at = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.flush()
    assert demo.notice.status == "open"  # the close_expired job has not run yet
    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert detail["status"] == "closed"
    items = (await client.get("/api/notices")).json()["items"]
    assert next(item for item in items if item["id"] == str(demo.notice.id))["status"] == "closed"
