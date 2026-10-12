"""Job bookkeeping and interpretation of pending documents."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import EngineError, EngineOutputError, EngineRun
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.config import Settings
from anbudsklar.contracts import Checklist, NoticeContext, PagedDocument
from anbudsklar.ingest.common import IngestError
from anbudsklar.models import ChecklistRecord, Document, JobRun, Notice
from anbudsklar.services.background import interpret_in_background
from anbudsklar.services.checklists import (
    MAX_INTERPRET_ATTEMPTS,
    interpret_pending,
    list_interpretations,
    reset_interpretation,
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
        self, notice: NoticeContext, document: PagedDocument
    ) -> tuple[Checklist, EngineRun]:
        if "trasig" in document.filename:
            raise EngineError("Språkmodellen svarar inte just nu.")
        if "kontrakt" in document.filename:
            raise EngineOutputError("Svaret följde inte kontraktet.")
        if "stor" in document.filename:
            raise EngineError("Underlaget är för stort för språkmodellen i Eneo.", retryable=False)
        return await super().interpret_document(notice, document)


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
