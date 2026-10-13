"""Job bookkeeping and interpretation of pending documents."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineError, EngineOutputError, EngineRun
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.api.schemas import ChecklistUpdate
from anbudsklar.config import Settings
from anbudsklar.contracts import Checklist, DocumentSet, NoticeContext, PublishedAnswerInput
from anbudsklar.ingest.common import IngestError
from anbudsklar.models import AppSetting, ChecklistRecord, Document, JobRun, Notice, PublishedAnswer
from anbudsklar.services.background import interpret_in_background
from anbudsklar.services.checklists import (
    MAX_INTERPRET_ATTEMPTS,
    SUPERSEDED_NOTE,
    checklist_payload,
    interpret_changed,
    interpret_document,
    interpret_pending,
    list_interpretations,
    reset_interpretation,
    update_checklist,
)
from anbudsklar.services.errors import ConflictError
from anbudsklar.services.jobs import (
    JOBS,
    JobContext,
    last_fetching_start,
    run_error_message,
    run_job,
    start_run,
)
from anbudsklar.services.notices import close_expired_notices
from api.factories import RecordingMailer, add_document, add_notice, bound_session_factory


@pytest.fixture
async def context() -> JobContext:
    return JobContext(
        settings=Settings(),
        http=httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(500))),
        engine=HeuristicEngine(),
        mailer=RecordingMailer(),
    )


async def test_successful_and_failed_runs_are_recorded(db_session: AsyncSession, context: JobContext) -> None:
    factory = bound_session_factory(db_session)

    async def works(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
        return {"loaded": 7}

    async def breaks(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
        raise ValueError("trasig fil")

    ok_id = await run_job(factory, "load_agreements", context, works)
    failed_id = await run_job(factory, "load_cpv", context, breaks)

    ok = await db_session.get(JobRun, ok_id)
    failed = await db_session.get(JobRun, failed_id)
    assert ok is not None and failed is not None
    assert (ok.status, ok.stats, ok.error) == ("ok", {"loaded": 7}, None)
    assert ok.finished_at is not None and ok.finished_at >= ok.started_at
    assert (failed.status, failed.error) == (
        "failed",
        "Tekniskt fel (ValueError). Detaljerna finns i loggen.",
    )


def test_only_our_own_error_text_reaches_the_jobs_list() -> None:
    assert run_error_message(IngestError("TED svarade med fel 503.")) == "TED svarade med fel 503."
    assert run_error_message(ConflictError("Jobbet körs redan.")) == "Jobbet körs redan."
    assert run_error_message(EngineError("Eneo svarar inte.")) == "Eneo svarar inte."
    leaked = RuntimeError("(psycopg) INSERT INTO companies VALUES ('hemligt')")
    assert run_error_message(leaked) == "Tekniskt fel (RuntimeError). Detaljerna finns i loggen."


async def test_a_job_does_not_start_twice(db_session: AsyncSession) -> None:
    await start_run(db_session, "match_all")
    with pytest.raises(ConflictError):
        await start_run(db_session, "match_all")
    await start_run(db_session, "send_reminders")


class FlakyEngine(HeuristicEngine):
    """Fails on documents whose file name says so: "trasig" for a while, "kontrakt" and "stor" for good."""

    async def interpret_document(
        self,
        notice: NoticeContext,
        documents: DocumentSet,
        answers: Sequence[PublishedAnswerInput] = (),
    ) -> tuple[Checklist, EngineRun]:
        filename = documents.documents[0].filename  # the main document decides
        if "trasig" in filename:
            raise EngineError("Språkmodellen svarar inte just nu.")
        if "kontrakt" in filename:
            raise EngineOutputError("Svaret följde inte kontraktet.")
        if "stor" in filename:
            raise EngineError("Underlaget är för stort för språkmodellen i Eneo.", retryable=False)
        return await super().interpret_document(notice, documents, answers)


PAGES = ["Kvalificering\nAnbudsgivaren ska ha F-skattsedel. Anbudsgivaren ska bifoga referenser."]


async def test_interpret_pending_skips_interpreted_documents_and_backs_off_after_failures(
    db_session: AsyncSession,
) -> None:
    notice = await add_notice(db_session)
    good = await add_document(db_session, notice, PAGES, filename="underlag.txt")
    broken = await add_document(db_session, notice, [*PAGES, "Bilagor"], filename="trasig.txt")

    stats = await interpret_pending(db_session, FlakyEngine())
    assert stats == {"pending": 2, "interpreted": 1, "failed": 1, "gave_up": 0}
    record = (await db_session.scalars(select(ChecklistRecord))).one()
    assert record.document_id == good.id
    assert record.status == "draft"
    assert record.verification["citations_total"] >= 1
    assert broken.interpret_attempts == 1
    assert broken.interpret_error == "Språkmodellen svarar inte just nu."
    assert broken.interpret_retry_at is not None
    assert broken.interpret_retry_at > datetime.now(UTC) + timedelta(minutes=14)

    # Not due yet: the next run leaves the failing document alone.
    assert await interpret_pending(db_session, FlakyEngine()) == {
        "pending": 0,
        "interpreted": 0,
        "failed": 0,
        "gave_up": 0,
    }

    # Once due it is retried, and the worker gives up after the last attempt.
    for _ in range(MAX_INTERPRET_ATTEMPTS - 1):
        broken.interpret_retry_at = datetime.now(UTC) - timedelta(seconds=1)
        await db_session.flush()
        assert (await interpret_pending(db_session, FlakyEngine()))["failed"] == 1
    assert broken.interpret_attempts == MAX_INTERPRET_ATTEMPTS
    assert broken.interpret_retry_at is None
    assert (await interpret_pending(db_session, FlakyEngine()))["pending"] == 0


async def test_attachments_wait_until_a_buyer_asks(db_session: AsyncSession) -> None:
    notice = await add_notice(db_session)
    attachment = await add_document(db_session, notice, PAGES, filename="kravspecifikation.txt")
    attachment.auto_interpret = False
    await db_session.flush()

    assert (await interpret_pending(db_session, FlakyEngine()))["pending"] == 0
    assert await list_interpretations(db_session) == []

    await reset_interpretation(db_session, attachment.id)
    assert (await interpret_pending(db_session, FlakyEngine()))["interpreted"] == 1


async def test_permanent_failures_give_up_at_once_and_never_block_new_documents(
    db_session: AsyncSession,
) -> None:
    notice = await add_notice(db_session)
    broken = [
        await add_document(db_session, notice, [*PAGES, f"Bilaga {index}"], filename=f"kontrakt-{index}.txt")
        for index in range(3)
    ]
    empty = await add_document(db_session, notice, ["   "], filename="tom.txt")
    too_large = await add_document(db_session, notice, [*PAGES, "Bilaga"], filename="stor.txt")
    stats = await interpret_pending(db_session, FlakyEngine(), limit=5)
    assert stats == {"pending": 5, "interpreted": 0, "failed": 5, "gave_up": 5}
    assert all(document.interpret_retry_at is None for document in [*broken, empty, too_large])
    assert "läsbar text" in (empty.interpret_error or "")
    assert too_large.interpret_attempts == 1 and "för stort" in (too_large.interpret_error or "")

    newer = await add_document(db_session, notice, [*PAGES, "Ny bilaga"], filename="nytt.txt")
    stats = await interpret_pending(db_session, FlakyEngine(), limit=1)
    assert stats["interpreted"] == 1
    record = (await db_session.scalars(select(ChecklistRecord))).one()
    assert record.document_id == newer.id


async def test_a_failed_background_interpretation_is_recorded_for_the_worker(
    db_session: AsyncSession,
) -> None:
    notice = await add_notice(db_session)
    document = await add_document(db_session, notice, PAGES, filename="trasig.txt")
    await interpret_in_background(bound_session_factory(db_session), FlakyEngine(), document.id)
    stored = await db_session.get(Document, document.id)
    assert stored is not None
    assert stored.interpret_attempts == 1
    assert stored.interpret_retry_at is not None


async def test_open_notices_past_their_deadline_are_closed(db_session: AsyncSession) -> None:
    now = datetime.now(UTC)
    expired = await add_notice(db_session, external_id="EXP-1", deadline_at=now - timedelta(minutes=1))
    running = await add_notice(db_session, external_id="EXP-2", deadline_at=now + timedelta(days=3))
    undated = await add_notice(db_session, external_id="EXP-3", deadline_at=None)
    planned = await add_notice(
        db_session, external_id="EXP-4", status="planned", deadline_at=now - timedelta(days=1)
    )
    assert "close_expired" in JOBS
    assert await close_expired_notices(db_session, now) == {"closed": 1}
    statuses = {
        notice.external_id: notice.status
        for notice in (
            await db_session.scalars(
                select(Notice).where(Notice.id.in_([expired.id, running.id, undated.id, planned.id]))
            )
        )
    }
    assert statuses == {"EXP-1": "closed", "EXP-2": "open", "EXP-3": "open", "EXP-4": "planned"}


async def test_only_runs_that_fetched_count_as_the_last_fetch(db_session: AsyncSession) -> None:
    earlier = datetime(2026, 10, 7, 4, 30, tzinfo=UTC)
    blocked = datetime(2026, 10, 8, 4, 30, tzinfo=UTC)
    db_session.add_all(
        [
            JobRun(job="ingest_eavrop", status="ok", started_at=earlier, stats={"fetched": 459}),
            JobRun(job="ingest_eavrop", status="ok", started_at=blocked, stats={"fetched": 0, "blocked": 2}),
            JobRun(job="ingest_eavrop", status="failed", started_at=blocked, stats={"fetched": 12}),
        ]
    )
    await db_session.flush()

    assert await last_fetching_start(db_session, "ingest_eavrop") == earlier
    assert await last_fetching_start(db_session, "ingest_ted") is None


# --- Interpreting again after new published answers (decision 0018) -------------------------


async def _answer(session: AsyncSession, notice: Notice, key: str, answer: str) -> PublishedAnswer:
    row = PublishedAnswer(
        notice_id=notice.id,
        source="eavrop",
        external_key=key * 64,
        question="Ska F-skattsedel bifogas?",
        answer=answer,
        asked_at=None,
        answered_at=datetime.now(UTC) - timedelta(hours=1),
    )
    session.add(row)
    await session.flush()
    return row


async def _records(session: AsyncSession, notice: Notice) -> list[ChecklistRecord]:
    return list(
        await session.scalars(
            select(ChecklistRecord)
            .where(ChecklistRecord.notice_id == notice.id)
            .order_by(ChecklistRecord.created_at)
        )
    )


async def test_a_checklist_follows_new_changed_and_withdrawn_answers(db_session: AsyncSession) -> None:
    notice = await add_notice(db_session)
    document = await add_document(db_session, notice, PAGES)
    first = await interpret_document(db_session, FlakyEngine(), document.id)
    first.status, first.published_at = "published", datetime.now(UTC)
    await db_session.flush()
    # Nothing changed: no answers then, none now.
    assert await interpret_changed(db_session, FlakyEngine()) == {
        "reinterpreted": 0,
        "reinterpret_failed": 0,
    }

    answer = await _answer(db_session, notice, "a", "Ja.")
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    records = await _records(db_session, notice)
    assert len(records) == 2 and records[1].answers_digest is not None
    # Inköp reviews by default, so the successor is a draft and companies keep the published one.
    assert (records[0].status, records[1].status) == ("published", "draft")
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 0

    # The untouched draft is replaced when the answer is edited, and marked so.
    answer.answer = "Ja, F-skattsedel ska bifogas."
    await db_session.flush()
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    records = await _records(db_session, notice)
    assert [record.status for record in records] == ["published", "rejected", "draft"]
    assert records[1].reviewer_note == SUPERSEDED_NOTE

    # A withdrawn answer counts as a change too.
    await db_session.delete(answer)
    await db_session.flush()
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    assert (await _records(db_session, notice))[-1].answers_digest is None


async def test_inkops_own_work_and_closed_notices_are_left_alone(db_session: AsyncSession) -> None:
    commented = await add_notice(db_session, title="Kommenterat utkast", external_id="TEST-K")
    draft = await interpret_document(
        db_session, FlakyEngine(), (await add_document(db_session, commented, PAGES)).id
    )
    draft.reviewer_note = "Kontrollera K2 mot bilagan."
    approved_notice = await add_notice(db_session, title="Godkänd", external_id="TEST-G")
    approved = await interpret_document(
        db_session, FlakyEngine(), (await add_document(db_session, approved_notice, PAGES)).id
    )
    approved.status = "approved"
    closed = await add_notice(db_session, title="Stängd", status="closed", external_id="TEST-S")
    await interpret_document(db_session, FlakyEngine(), (await add_document(db_session, closed, PAGES)).id)
    for notice in (commented, approved_notice, closed):
        await _answer(db_session, notice, "b", "Nej.")

    assert await interpret_changed(db_session, FlakyEngine()) == {
        "reinterpreted": 0,
        "reinterpret_failed": 0,
    }


async def test_a_failed_reinterpretation_backs_off_and_gives_up_like_a_new_document(
    db_session: AsyncSession,
) -> None:
    """A document that keeps failing must not be sent to the model every five minutes (decision 0018)."""

    flaky = await add_notice(db_session, title="Trasig", external_id="TEST-T")
    flaky_document = await add_document(db_session, flaky, PAGES, filename="trasig.txt")
    too_large = await add_notice(db_session, title="Stor", external_id="TEST-L")
    large_document = await add_document(db_session, too_large, PAGES, filename="stor.txt")
    for notice, document in ((flaky, flaky_document), (too_large, large_document)):
        db_session.add(
            ChecklistRecord(
                notice_id=notice.id,
                document_id=document.id,
                status="published",
                published_at=datetime.now(UTC),
                engine="heuristic",
                contract_version="test",
                payload=Checklist(summary="x", requirements=[]).model_dump(mode="json"),
            )
        )
        await _answer(db_session, notice, "c", "Ja.")

    assert await interpret_changed(db_session, FlakyEngine()) == {
        "reinterpreted": 0,
        "reinterpret_failed": 2,
    }
    assert flaky_document.interpret_attempts == 1 and flaky_document.interpret_retry_at is not None
    assert large_document.interpret_retry_at is None  # too large for the model: given up at once
    # The next run waits for the retry time and never tries the one it gave up on.
    assert await interpret_changed(db_session, FlakyEngine()) == {
        "reinterpreted": 0,
        "reinterpret_failed": 0,
    }
    flaky_document.interpret_retry_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.flush()
    assert await interpret_changed(db_session, FlakyEngine()) == {
        "reinterpreted": 0,
        "reinterpret_failed": 1,
    }
    assert flaky_document.interpret_attempts == 2
    # Inköp sees both under "Underlag att tolka", where "Tolka igen" gets the given-up one going.
    listed = {item.document_id: item.state for item in await list_interpretations(db_session)}
    assert listed == {flaky_document.id: "retrying", large_document.id: "failed"}


async def test_with_the_review_off_the_successor_is_published_and_a_saved_draft_is_kept(
    db_session: AsyncSession,
) -> None:
    db_session.add(AppSetting(key="review_required", value=False))
    notice = await add_notice(db_session)
    document = await add_document(db_session, notice, PAGES)
    first = await interpret_document(db_session, FlakyEngine(), document.id)
    assert first.status == "published"
    await _answer(db_session, notice, "d", "Ja.")

    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    records = await _records(db_session, notice)
    assert [record.status for record in records] == ["published", "published"]
    assert records[1].approved_at is None and records[1].published_at is not None

    # A draft inköp saved, without a note, is inköp's work and is not replaced.
    saved = await add_notice(db_session, title="Sparat utkast", external_id="TEST-U")
    draft = await interpret_document(
        db_session, FlakyEngine(), (await add_document(db_session, saved, PAGES)).id
    )
    draft.status = "draft"
    await update_checklist(
        db_session, draft.id, ChecklistUpdate(checklist=checklist_payload(draft), reviewer_note=None)
    )
    await _answer(db_session, saved, "e", "Nej.")
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 0
    assert [record.status for record in await _records(db_session, saved)] == ["draft"]


ATTACHMENT_PAGES = ["Krav på entreprenören\nEntreprenören ska vara certifierad enligt ISO 14001."]


async def test_an_interpretation_reads_every_current_document_and_says_so(db_session: AsyncSession) -> None:
    """Requirements in an attachment reach the checklist, named and verified (decision 0020)."""

    notice = await add_notice(db_session)
    main = await add_document(db_session, notice, PAGES, filename="underlag.txt")
    attachment = await add_document(db_session, notice, ATTACHMENT_PAGES, filename="6.6 Krav.txt")
    old = await add_document(db_session, notice, ["Gammal text som ska bort."], filename="gammal.txt")
    old.superseded_by = main.id
    await db_session.flush()

    record = await interpret_document(db_session, FlakyEngine(), main.id)

    checklist = checklist_payload(record)
    iso = next(r for r in checklist.requirements if "ISO 14001" in r.citation.quote)
    assert (iso.citation.document, iso.citation.document_id, iso.citation.check) == (
        "6.6 Krav.txt",
        str(attachment.id),
        "verified",
    )
    assert not any("Gammal text" in r.citation.quote for r in checklist.requirements)
    assert record.verification["read"] == {
        "documents_read": 2,
        "documents_total": 2,
        "pages_read": 2,
        "pages_total": 2,
    }
    assert record.documents_digest is not None


async def test_a_checklist_follows_added_documents_and_a_new_extraction(db_session: AsyncSession) -> None:
    notice = await add_notice(db_session)
    main = await add_document(db_session, notice, PAGES)
    first = await interpret_document(db_session, FlakyEngine(), main.id)
    first.status, first.published_at = "published", datetime.now(UTC)
    await db_session.flush()
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 0

    # The buyer attaches the requirement specification later: the checklist must cover it.
    await add_document(db_session, notice, ATTACHMENT_PAGES, filename="6.6 Krav.txt")
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    records = await _records(db_session, notice)
    assert [record.status for record in records] == ["published", "draft"]
    assert any("ISO 14001" in r.citation.quote for r in checklist_payload(records[1]).requirements)
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 0

    # An improved extraction read the main document again: the pages may say more now.
    main.extraction_version += 1
    await db_session.flush()
    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    assert [record.status for record in await _records(db_session, notice)] == [
        "published",
        "rejected",
        "draft",
    ]


async def test_a_checklist_from_before_the_decision_is_outdated_only_when_more_documents_exist(
    db_session: AsyncSession,
) -> None:
    alone = await add_notice(db_session, title="Ett dokument", external_id="TEST-A")
    alone_document = await add_document(db_session, alone, PAGES)
    several = await add_notice(db_session, title="Flera dokument", external_id="TEST-F")
    several_main = await add_document(db_session, several, PAGES)
    await add_document(db_session, several, ATTACHMENT_PAGES, filename="6.6 Krav.txt")
    for notice_, document in ((alone, alone_document), (several, several_main)):
        db_session.add(
            ChecklistRecord(
                notice_id=notice_.id,
                document_id=document.id,
                status="published",
                published_at=datetime.now(UTC),
                engine="heuristic",
                contract_version="test",
                payload=Checklist(summary="x", requirements=[]).model_dump(mode="json"),
                documents_digest=None,
            )
        )
    await db_session.flush()

    assert (await interpret_changed(db_session, FlakyEngine()))["reinterpreted"] == 1
    assert len(await _records(db_session, alone)) == 1
    assert len(await _records(db_session, several)) == 2


async def test_a_main_document_too_large_for_one_call_is_refused_for_good(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from anbudsklar.services import checklists

    monkeypatch.setattr(checklists, "build_document_set", lambda paged, **kw: _cut(paged, kw))
    notice = await add_notice(db_session)
    document = await add_document(db_session, notice, PAGES)
    stats = await interpret_pending(db_session, FlakyEngine())
    assert stats == {"pending": 1, "interpreted": 0, "failed": 1, "gave_up": 1}
    assert "för stort" in (document.interpret_error or "")


def _cut(paged: list, options: dict) -> object:
    from anbudsklar.documents.bundle import build_document_set

    return build_document_set(paged, budget_chars=10, **options)
