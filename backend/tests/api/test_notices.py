"""Notice list and detail, document pages and files, and questions about the document."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.store import store_document
from anbudsklar.models import JobRun, MatchRecord, PublishedAnswer, QuestionLog
from anbudsklar.services.dates import end_of_local_day

from .factories import (
    Demo,
    add_checklist,
    add_cpv_codes,
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
    # The document has its checklist, a draft: nothing more is on its way for companies.
    assert body["checklist_progress"] is None
    assert (await client.get(f"/api/notices/{uuid.uuid4()}")).status_code == 404


async def test_detail_says_while_a_checklist_is_on_its_way(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The page shows a checklist as coming only while the worker will interpret (decision 0019)."""

    notice = await add_notice(db_session, title="Snöröjning (fiktiv)", external_id="TEST-3")
    document = await add_document(db_session, notice, document_pages(demo.fragestopp, demo.deadline))
    url = f"/api/notices/{notice.id}"

    async def progress() -> dict[str, object] | None:
        return (await client.get(url)).json()["checklist_progress"]

    # Nothing has run yet: in the queue, with no run to count from.
    assert await progress() == {
        "state": "queued",
        "attempts": 0,
        "max_attempts": 5,
        "retry_at": None,
        "next_run_at": None,
        "last_run_at": None,
    }

    # The worker's last run says when the next one is due.
    started = datetime.now(UTC) - timedelta(minutes=2)
    db_session.add(
        JobRun(job="interpret_pending", status="ok", started_at=started, finished_at=started, stats={})
    )
    await db_session.flush()
    queued = await progress()
    assert queued is not None and queued["state"] == "queued"
    assert datetime.fromisoformat(str(queued["next_run_at"])) == started + timedelta(minutes=5)

    # While the job runs, the page says so.
    running = JobRun(job="interpret_pending", status="running", started_at=datetime.now(UTC), stats={})
    db_session.add(running)
    await db_session.flush()
    assert (await progress() or {})["state"] == "running"
    running.status = "ok"
    running.finished_at = datetime.now(UTC)

    # A failure the worker will try again after still counts as on its way.
    document.interpret_attempts = 1
    document.interpret_retry_at = datetime.now(UTC) + timedelta(minutes=15)
    await db_session.flush()
    retrying = await progress()
    assert retrying is not None and retrying["state"] == "retrying" and retrying["attempts"] == 1
    assert retrying["retry_at"] is not None

    # Once it gave up, nothing is on its way until a buyer asks for a new interpretation.
    document.interpret_retry_at = None
    await db_session.flush()
    assert await progress() is None

    # An attachment is never interpreted on its own.
    document.interpret_attempts = 0
    document.auto_interpret = False
    await db_session.flush()
    assert await progress() is None

    # The demo notice has its published checklist: nothing is on its way there either.
    assert (await client.get(f"/api/notices/{demo.notice.id}")).json()["checklist_progress"] is None


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


async def test_a_restricted_procedure_says_its_deadline_is_for_anbudsansokan(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The tender period runs on past that day, so questions asked then are still logged."""

    url = f"/api/notices/{demo.notice.id}"
    assert (await client.get(url)).json()["deadline_kind"] == "tender"
    demo.notice.deadline_kind = "request"
    demo.notice.deadline_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()

    detail = (await client.get(url)).json()
    listed = (await client.get("/api/notices")).json()["items"]
    assert detail["deadline_kind"] == "request"
    assert [item["deadline_kind"] for item in listed if item["id"] == str(demo.notice.id)] == ["request"]
    await client.post(f"{url}/questions", json={"question": "Vilken ansvarsförsäkring krävs?"})
    assert len((await db_session.scalars(select(QuestionLog))).all()) == 1


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


async def _status_mix(session: AsyncSession, demo: Demo) -> dict[str, str]:
    """Next to the demo notice (open, deadline in 30 days): two more open, one planned, one closed."""

    soon = await add_notice(
        session,
        title="Fönsterputs vid förskolor (fiktiv)",
        external_id="TEST-SOON",
        deadline_at=datetime.now(UTC) + timedelta(days=5),
    )
    undated = await add_notice(
        session, title="Vinterväghållning (fiktiv)", external_id="TEST-UNDATED", cpv_codes=["90620000"]
    )
    planned = await add_notice(
        session, title="Takrenovering av förskola (fiktiv)", external_id="TEST-PLANNED", status="planned"
    )
    closed = await add_notice(
        session,
        title="Ommålning av skola (fiktiv)",
        external_id="TEST-CLOSED",
        status="closed",
        deadline_at=datetime.now(UTC) - timedelta(days=10),
    )
    return {
        "demo": str(demo.notice.id),
        "soon": str(soon.id),
        "undated": str(undated.id),
        "planned": str(planned.id),
        "closed": str(closed.id),
    }


async def test_open_notices_come_soonest_deadline_first_with_counts_per_status(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    ids = await _status_mix(db_session, demo)

    body = (await client.get("/api/notices", params={"status": "open"})).json()
    assert body["sort"] == "deadline"
    assert [item["id"] for item in body["items"]] == [ids["soon"], ids["demo"], ids["undated"]]  # none last
    assert body["total"] == 3
    # The same counts whichever status is chosen: they ignore the status filter.
    assert body["counts"] == {"open": 3, "planned": 1, "all": 5}

    everything = (await client.get("/api/notices")).json()
    assert everything["sort"] == "published"
    assert everything["counts"] == body["counts"]
    assert everything["total"] == 5


async def test_counts_follow_the_other_filters_and_sort_can_be_chosen(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    ids = await _status_mix(db_session, demo)

    searched = (await client.get("/api/notices", params={"q": "takrenovering"})).json()
    assert searched["sort"] == "relevance"
    assert searched["counts"] == {"open": 0, "planned": 1, "all": 1}
    # Each count is what choosing that status lists, also when the search falls back to similar
    # titles ("målningsarbete" is in no text, but close to "Ommålning").
    for q in ("takrenovering", "förskola", "fönsterputs", "målningsarbete"):
        counts = (await client.get("/api/notices", params={"q": q})).json()["counts"]
        for status in ("open", "planned"):
            listed = (await client.get("/api/notices", params={"q": q, "status": status})).json()
            assert listed["total"] == counts[status], (q, status)
        assert (await client.get("/api/notices", params={"q": q})).json()["total"] == counts["all"], q

    by_cpv = (await client.get("/api/notices", params={"cpv": "4544", "status": "planned"})).json()
    assert by_cpv["counts"] == {"open": 2, "planned": 1, "all": 4}  # not the snow clearing
    assert [item["id"] for item in by_cpv["items"]] == [ids["planned"]]

    newest = (await client.get("/api/notices", params={"status": "open", "sort": "published"})).json()
    assert newest["sort"] == "published"
    # Relevance means nothing without text, so the list says it is newest first.
    assert (await client.get("/api/notices", params={"sort": "relevance"})).json()["sort"] == "published"
    assert (await client.get("/api/notices", params={"sort": "price"})).status_code == 422


async def test_notices_name_their_cpv_codes(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await add_cpv_codes(db_session, {"45442110": "Målning av byggnader", "45442100": "Målning"})
    demo.notice.cpv_codes = ["45442110", "45442100", "45442180"]  # the last one is not in the list
    await db_session.flush()

    [item] = [
        item
        for item in (await client.get("/api/notices")).json()["items"]
        if item["id"] == str(demo.notice.id)
    ]
    assert item["cpv_label"] == "Målning av byggnader"  # the main code is the first
    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert detail["cpv_label"] == "Målning av byggnader"
    assert detail["cpv_labels"] == {"45442110": "Målning av byggnader", "45442100": "Målning"}

    unknown = await add_notice(db_session, external_id="TEST-UNKNOWN-CPV", cpv_codes=["99999999"])
    assert (await client.get(f"/api/notices/{unknown.id}")).json()["cpv_label"] is None


async def test_the_match_says_which_engine_made_it(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await _match(db_session, demo)
    await login(client, "foretagare")
    body = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert body["match"]["engine"] == "heuristic"


async def test_lists_carry_the_question_deadline_of_the_published_checklist(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The Start page's "Nästa frist" needs frågestopp for every match, without a request per notice."""

    draft_only = await add_notice(db_session, title="Städtjänster (fiktiv)", external_id="TEST-DRAFT-ONLY")
    document = await add_document(db_session, draft_only, document_pages(demo.fragestopp, demo.deadline))
    await add_checklist(
        db_session, draft_only, document, demo_checklist(demo.fragestopp, demo.deadline), status="draft"
    )
    items = {item["id"]: item for item in (await client.get("/api/notices")).json()["items"]}
    published = datetime.fromisoformat(items[str(demo.notice.id)]["question_deadline"])
    assert published == end_of_local_day(demo.fragestopp)  # the last day for questions lasts until it ends
    assert items[str(draft_only.id)]["question_deadline"] is None  # not reviewed by inköp yet

    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert datetime.fromisoformat(detail["question_deadline"]) == end_of_local_day(demo.fragestopp)


async def test_notices_carry_the_reference_number(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The notice header reads "Sundsvalls kommun · DEMO-2026-0147"."""

    demo.notice.reference_number = "DEMO-2026-0147"
    unnumbered = await add_notice(db_session, title="Städtjänster (fiktiv)", external_id="TEST-NO-REF")
    await db_session.flush()

    items = {item["id"]: item for item in (await client.get("/api/notices")).json()["items"]}
    assert items[str(demo.notice.id)]["reference_number"] == "DEMO-2026-0147"
    assert items[str(unnumbered.id)]["reference_number"] is None
    detail = (await client.get(f"/api/notices/{demo.notice.id}")).json()
    assert detail["reference_number"] == "DEMO-2026-0147"


async def _buyer_mix(session: AsyncSession, demo: Demo) -> dict[str, str]:
    """Next to the demo notice (Sundsvalls kommun, open): joint procurements and other buyers."""

    joint = await add_notice(
        session, title="Vinterväghållning (fiktiv)", external_id="TEST-JOINT", cpv_codes=["90620000"]
    )
    joint.buyer = "Timrå kommun, Sundsvalls kommun"
    region = await add_notice(session, title="Takrenovering av förskola (fiktiv)", external_id="TEST-REGION")
    region.buyer = "Region Västernorrland, Sundsvalls Kommun"  # another spelling of the same buyer
    planned = await add_notice(
        session, title="Fönsterputs vid förskolor (fiktiv)", external_id="TEST-MITTHEM", status="planned"
    )
    planned.buyer = "Mitthem AB"
    unnamed = await add_notice(session, title="Snöröjning (fiktiv)", external_id="TEST-NO-BUYER")
    unnamed.buyer = None
    await session.flush()
    return {"demo": str(demo.notice.id), "joint": str(joint.id), "region": str(region.id)}


async def test_buyers_are_listed_one_by_one_with_counts(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await _buyer_mix(db_session, demo)

    response = await client.get("/api/notices/buyers")  # not taken for a notice id
    assert response.status_code == 200, response.text
    assert response.json()["items"] == [
        {"name": "Sundsvalls kommun", "count": 3},  # as most notices spell it
        {"name": "Mitthem AB", "count": 1},
        {"name": "Region Västernorrland", "count": 1},
        {"name": "Timrå kommun", "count": 1},
    ]
    open_only = (await client.get("/api/notices/buyers", params={"status": "open"})).json()["items"]
    assert "Mitthem AB" not in {buyer["name"] for buyer in open_only}


async def test_the_buyer_filter_matches_part_of_the_name_and_the_counts_follow_it(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    ids = await _buyer_mix(db_session, demo)

    body = (await client.get("/api/notices", params={"buyer": " sundsvalls KOMMUN "})).json()
    assert {item["id"] for item in body["items"]} == {ids["demo"], ids["joint"], ids["region"]}
    assert body["counts"] == {"open": 3, "planned": 0, "all": 3}
    timra = (await client.get("/api/notices", params={"buyer": "Timrå", "status": "open"})).json()
    assert [item["id"] for item in timra["items"]] == [ids["joint"]]
    assert timra["counts"] == {"open": 1, "planned": 0, "all": 1}
    assert (await client.get("/api/notices", params={"buyer": "TIMRÅ"})).json()["total"] == 1  # å and Å
    assert (await client.get("/api/notices", params={"buyer": "x" * 301})).status_code == 422
    assert (await client.get("/api/notices", params={"buyer": "100%"})).json()["total"] == 0


async def test_each_buyers_count_is_what_filtering_on_it_lists(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    await _buyer_mix(db_session, demo)

    # "målningsarbete" is in no text, so the search falls back to similar titles ("Ommålning").
    for filters in (
        {},
        {"status": "open"},
        {"q": "förskola"},
        {"q": "målningsarbete"},
        {"q": "kärnkraftverk"},
        {"cpv": "4544"},
        {"source": "fixture", "status": "planned"},
    ):
        buyers = (await client.get("/api/notices/buyers", params=filters)).json()["items"]
        for buyer in buyers:
            listed = (await client.get("/api/notices", params={**filters, "buyer": buyer["name"]})).json()
            assert listed["total"] == buyer["count"], (filters, buyer)
        if filters.get("q") == "kärnkraftverk":
            assert buyers == []
        else:
            assert buyers, filters


async def test_answers_read_every_document_and_cite_the_one_they_come_from(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    attachment = await add_document(
        db_session,
        demo.notice,
        ["Krav på entreprenören\nEntreprenören ska lämna en hållbarhetsredovisning varje år."],
        filename="6.6 Krav på Entreprenör.pdf",
    )

    response = await client.post(
        f"/api/notices/{demo.notice.id}/questions", json={"question": "Krävs en hållbarhetsredovisning?"}
    )

    body = response.json()
    assert response.status_code == 200, body
    assert body["document_id"] == str(demo.document.id)  # the main document stays the answer's default
    assert body["read"] == {
        "documents_read": 2,
        "documents_total": 2,
        "pages_read": demo.document.page_count + 1,
        "pages_total": demo.document.page_count + 1,
    }
    citation = body["answer"]["citations"][0]
    assert citation["document"] == "6.6 Krav på Entreprenör.pdf"
    assert citation["document_id"] == str(attachment.id)
    assert citation["check"] == "verified"


async def test_the_detail_lists_the_published_answers_oldest_first(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The buyer's published answers (decision 0013) are public: no sign-in, and never who asked."""

    now = datetime.now(UTC)
    db_session.add_all(
        [
            PublishedAnswer(
                notice_id=demo.notice.id,
                source="eavrop",
                external_key="b" * 64,
                question="Gäller kravet på F-skatt även underleverantörer?",
                answer="Ja.",
                asked_at=now - timedelta(days=2),
                answered_at=now - timedelta(days=1),
            ),
            PublishedAnswer(
                notice_id=demo.notice.id,
                source="eavrop",
                external_key="a" * 64,
                question="Ska ställning ingå i priset?",
                answer="Ja, ställning ingår i anbudspriset.",
                asked_at=None,
                answered_at=now - timedelta(days=3),
            ),
        ]
    )
    await db_session.flush()

    body = (await client.get(f"/api/notices/{demo.notice.id}")).json()

    assert [item["question"] for item in body["published_answers"]] == [
        "Ska ställning ingå i priset?",
        "Gäller kravet på F-skatt även underleverantörer?",
    ]
    first = body["published_answers"][0]
    assert first["answer"] == "Ja, ställning ingår i anbudspriset."
    assert first["source"] == "eavrop" and first["asked_at"] is None
    assert set(first) == {"source", "key", "question", "answer", "asked_at", "answered_at"}
    assert first["key"] == "a" * 64


async def test_a_question_inkop_has_answered_in_eavrop_is_answered_from_that_answer(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The published answer goes first, quoted with its key and checked by our code (decision 0018)."""

    now = datetime.now(UTC)
    db_session.add(
        PublishedAnswer(
            notice_id=demo.notice.id,
            source="eavrop",
            external_key="c" * 64,
            question="Gäller kravet på F-skattsedel även underleverantörer?",
            answer="Ja, kravet på F-skattsedel gäller även underleverantörer.",
            asked_at=now - timedelta(days=2),
            answered_at=now - timedelta(days=1),
        )
    )
    await db_session.flush()

    response = await client.post(
        f"/api/notices/{demo.notice.id}/questions",
        json={"question": "Gäller kravet på F-skattsedel även för underleverantörer?"},
    )

    assert response.status_code == 200, response.text
    answer = response.json()["answer"]
    assert answer["answer"].startswith("Inköp har svarat på en liknande fråga i e-Avrop:")
    assert answer["found_in_document"] is True
    [cited] = answer["answer_citations"]
    assert (cited["answer"], cited["check"], cited["answer_key"]) == (1, "verified", "c" * 64)


async def test_the_detail_names_unread_files_and_empty_pages_and_hides_replaced_documents(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    """The documents shown are never taken for the whole set (data review 2026-10-12)."""

    demo.notice.unread_files = [{"filename": "Ritningar.zip", "reason": "Filformatet .zip stöds inte"}]
    demo.document.empty_pages = 2
    old = await add_document(db_session, demo.notice, ["Gammal version."], filename="gammal.txt")
    old.superseded_by = demo.document.id
    await db_session.flush()

    body = (await client.get(f"/api/notices/{demo.notice.id}")).json()

    assert body["unread_files"] == [{"filename": "Ritningar.zip", "reason": "Filformatet .zip stöds inte"}]
    assert [(item["filename"], item["empty_pages"]) for item in body["documents"]] == [("underlag.txt", 2)]


async def test_the_sources_question_deadline_goes_before_the_checklists(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    from_source = end_of_local_day(demo.fragestopp + timedelta(days=2))
    demo.notice.question_deadline_at = from_source
    await db_session.flush()

    items = {item["id"]: item for item in (await client.get("/api/notices")).json()["items"]}
    assert datetime.fromisoformat(items[str(demo.notice.id)]["question_deadline"]) == from_source
    answer = (
        await client.post(f"/api/notices/{demo.notice.id}/questions", json={"question": "Krävs försäkring?"})
    ).json()
    assert datetime.fromisoformat(answer["question_deadline"]) == from_source
