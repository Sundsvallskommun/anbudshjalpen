"""Checklists: interpret a document, verify citations, and the buyer's approval flow.

Status moves draft -> approved -> published, or to rejected. A published checklist that
turns out to be wrong can be withdrawn: it becomes rejected with the buyer's reason, can
be corrected and published again, and companies meanwhile see the previous published
checklist, if any. A rejected checklist is never approved as it is: the buyer opens it
as a draft again (`reopen_checklist`) or corrects it, and approves that draft. Companies
only ever see published checklists; buyers see the latest one in any state. This is the
human review checkpoint that an Eneo Flow would have in production.

Interpretation failures are recorded on the document. The worker retries with growing
pauses and gives up after a few attempts, or at once when the failure will not go away
by itself; a buyer can then ask for a new interpretation.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import NamedTuple

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, EngineError, EngineOutputError
from anbudsklar.api.schemas import (
    ChecklistAdminItem,
    ChecklistProgress,
    ChecklistProgressState,
    ChecklistStatus,
    ChecklistUpdate,
    ChecklistView,
    InterpretationState,
    InterpretationView,
    ReadSummary,
    VerificationSummary,
)
from anbudsklar.contracts import CONTRACT_VERSION, Checklist, DocumentSet, PagedDocument, Task, deadline_kind
from anbudsklar.documents.bundle import build_document_set
from anbudsklar.documents.citations import verify_checklist
from anbudsklar.documents.store import current_documents, is_current, load_paged_documents
from anbudsklar.models import ChecklistRecord, Document, JobRun, Notice
from anbudsklar.services.access import Viewer
from anbudsklar.services.ai_usage import record_call
from anbudsklar.services.answers import answer_inputs, answers_digest
from anbudsklar.services.app_settings import review_required
from anbudsklar.services.contexts import notice_context, unread_filenames
from anbudsklar.services.dates import end_of_local_day, utcnow
from anbudsklar.services.errors import ConflictError, InvalidInputError, NotFoundError
from anbudsklar.visibility import shown_notices

logger = logging.getLogger(__name__)

DRAFT = "draft"
APPROVED = "approved"
PUBLISHED = "published"
REJECTED = "rejected"
EDITABLE_STATUSES = frozenset({DRAFT, APPROVED, REJECTED})
PENDING_BATCH_SIZE = 5
# Retries of a failed interpretation: 15 min, 30 min, 1 h, 2 h, then give up.
MAX_INTERPRET_ATTEMPTS = 5
RETRY_BASE_DELAY = timedelta(minutes=15)
RETRY_MAX_DELAY = timedelta(hours=6)
# The worker's job that interprets waiting documents, and how often it runs (the worker's
# schedule reads the interval from here, so the notice page can say when the next run is due).
INTERPRET_JOB = "interpret_pending"
INTERPRET_INTERVAL = timedelta(minutes=5)
# `services.jobs` imports this module, so its RUNNING and STALE_AFTER are repeated here.
_JOB_RUNNING = "running"
_JOB_STALE_AFTER = timedelta(hours=2)
MAX_ERROR_CHARS = 1000


# --- Reading ------------------------------------------------------------------------


def checklist_payload(record: ChecklistRecord) -> Checklist:
    return Checklist.model_validate(record.payload)


def to_checklist_view(record: ChecklistRecord) -> ChecklistView:
    return ChecklistView(
        id=record.id,
        notice_id=record.notice_id,
        document_id=record.document_id,
        status=_status(record.status),
        engine=record.engine,
        model=record.model,
        created_at=record.created_at,
        approved_at=record.approved_at,
        published_at=record.published_at,
        reviewed=record.approved_at is not None,
        reviewer_note=record.reviewer_note,
        verification=VerificationSummary.model_validate(record.verification or {}),
        checklist=checklist_payload(record),
    )


def key_date(checklist: Checklist, kind: str) -> date | None:
    """First dated entry of a kind (fragestopp, sista_anbudsdag, ...)."""

    return next((item.date for item in checklist.dates if item.kind == kind and item.date), None)


def tender_deadline(notice: Notice, checklist: Checklist | None) -> datetime | None:
    """When the tender period ends, or None while nobody knows.

    Usually the notice's deadline. A restricted procedure's notice only gives the last day
    for anbudsansökan; its tender deadline comes later, so only a checklist that names
    sista anbudsdag tells it, as the end of that day.
    """

    if deadline_kind(notice.deadline_kind) == "tender":
        return notice.deadline_at
    day = key_date(checklist, "sista_anbudsdag") if checklist else None
    return end_of_local_day(day) if day else None


async def published_checklist(session: AsyncSession, notice_id: uuid.UUID) -> ChecklistRecord | None:
    published = await published_checklists(session, [notice_id])
    return published.get(notice_id)


async def published_checklists(
    session: AsyncSession, notice_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, ChecklistRecord]:
    """The latest published checklist per notice."""

    if not notice_ids:
        return {}
    records = await session.scalars(
        select(ChecklistRecord)
        .where(ChecklistRecord.notice_id.in_(notice_ids), ChecklistRecord.status == PUBLISHED)
        .order_by(ChecklistRecord.published_at.desc(), ChecklistRecord.created_at.desc())
    )
    latest: dict[uuid.UUID, ChecklistRecord] = {}
    for record in records:
        latest.setdefault(record.notice_id, record)
    return latest


async def has_checklist(session: AsyncSession, document_id: uuid.UUID) -> bool:
    return bool(await session.scalar(select(exists().where(ChecklistRecord.document_id == document_id))))


async def latest_checklist(session: AsyncSession, notice_id: uuid.UUID) -> ChecklistRecord | None:
    return await session.scalar(
        select(ChecklistRecord)
        .where(ChecklistRecord.notice_id == notice_id)
        .order_by(ChecklistRecord.created_at.desc())
        .limit(1)
    )


async def visible_checklist(
    session: AsyncSession, notice_id: uuid.UUID, viewer: Viewer
) -> ChecklistRecord | None:
    if viewer.is_buyer:
        return await latest_checklist(session, notice_id)
    return await published_checklist(session, notice_id)


async def checklist_progress(session: AsyncSession, notice_id: uuid.UUID) -> ChecklistProgress | None:
    """Where the notice's first checklist is on its way, or None when none is coming (decision 0019).

    Follows the document `interpret_pending` would pick up first: before the worker has got
    to it, while the job runs, or while it will try again after a failure. None once the
    worker gave up, and for attachments, so that the notice page never promises a checklist
    that is not on its way. The next run is estimated from the job's last start and its
    interval, and unknown when the worker has not run for two intervals.
    """

    has_checklist = exists().where(ChecklistRecord.document_id == Document.id)
    waiting = or_(Document.interpret_attempts == 0, Document.interpret_retry_at.is_not(None))
    document = await session.scalar(
        select(Document)
        .where(
            Document.notice_id == notice_id,
            ~has_checklist,
            is_current(),
            Document.page_count > 0,
            Document.auto_interpret,
            waiting,
        )
        .order_by(Document.interpret_attempts, Document.created_at, Document.id)
        .limit(1)
    )
    if document is None:
        return None
    now = utcnow()
    last = (
        await session.execute(
            select(JobRun.started_at, JobRun.status)
            .where(JobRun.job == INTERPRET_JOB)
            .order_by(JobRun.started_at.desc())
            .limit(1)
        )
    ).first()
    last_run_at = last.started_at if last else None
    running = last is not None and last.status == _JOB_RUNNING and last.started_at > now - _JOB_STALE_AFTER
    recent = last_run_at is not None and last_run_at > now - 2 * INTERPRET_INTERVAL
    state: ChecklistProgressState = (
        "running" if running else "retrying" if document.interpret_attempts > 0 else "queued"
    )
    return ChecklistProgress(
        state=state,
        attempts=document.interpret_attempts,
        max_attempts=MAX_INTERPRET_ATTEMPTS,
        retry_at=document.interpret_retry_at,
        next_run_at=last_run_at + INTERPRET_INTERVAL if last_run_at and recent else None,
        last_run_at=last_run_at,
    )


class ChecklistState(NamedTuple):
    status: ChecklistStatus
    reviewed: bool  # inköp approved it (decision 0011)


async def checklist_statuses(
    session: AsyncSession, notice_ids: Sequence[uuid.UUID], viewer: Viewer
) -> dict[uuid.UUID, ChecklistState]:
    """What the viewer may know about each notice's checklist: buyers see every state."""

    if not notice_ids:
        return {}
    query = select(ChecklistRecord.notice_id, ChecklistRecord.status, ChecklistRecord.approved_at).where(
        ChecklistRecord.notice_id.in_(notice_ids)
    )
    if not viewer.is_buyer:
        query = query.where(ChecklistRecord.status == PUBLISHED)
    rows = await session.execute(query.order_by(ChecklistRecord.created_at.desc()))
    states: dict[uuid.UUID, ChecklistState] = {}
    for notice_id, status, approved_at in rows:
        states.setdefault(notice_id, ChecklistState(_status(status), approved_at is not None))
    return states


# --- Interpreting -------------------------------------------------------------------


class _Material(NamedTuple):
    """What an interpretation reads: the notice's current documents, the main one first."""

    documents: list[Document]
    paged: list[PagedDocument]
    document_set: DocumentSet


async def _material(session: AsyncSession, notice: Notice, main: Document) -> _Material:
    """Every current document of the notice as the engine gets it (decision 0020).

    The bundle keeps the main document whole and adds the attachments while the budget
    lasts. A main document that does not fit on its own is refused: half a checklist from
    half a document must not be published, so inköp is told to split it instead.
    """

    documents = await current_documents(session, notice.id, main=main)
    paged = await load_paged_documents(session, documents)
    if not paged or not any(page.strip() for page in paged[0].pages):
        raise InvalidInputError("Dokumentet innehåller ingen läsbar text att tolka.")
    document_set = build_document_set(paged, unread_files=unread_filenames(notice))
    outline = document_set.outline[0]
    if outline.pages_included < outline.page_count:
        chars = f"{sum(len(page) for page in paged[0].pages):,}".replace(",", " ")
        raise InvalidInputError(
            f"Huvuddokumentet är för stort för en tolkning i ett anrop ({outline.page_count} sidor, "
            f"{chars} tecken). Dela upp det och ladda upp delarna."
        )
    return _Material(documents, paged, document_set)


def documents_digest(documents: Sequence[Document]) -> str:
    """A fingerprint of which documents, in which extraction, a checklist was made from.

    A file the source adds or replaces, and a page text an improved extraction changes,
    both show up here, so that `interpret_changed` interprets the notice again.
    """

    content = sorted((str(document.id), document.extraction_version) for document in documents)
    return hashlib.sha256(json.dumps(content).encode()).hexdigest()


def read_summary(document_set: DocumentSet) -> ReadSummary:
    outline = document_set.outline
    return ReadSummary(
        documents_read=sum(1 for item in outline if item.pages_included > 0),
        documents_total=len(outline),
        pages_read=sum(item.pages_included for item in outline),
        pages_total=sum(item.page_count for item in outline),
    )


async def interpret_document(
    session: AsyncSession, engine: AiEngine, document_id: uuid.UUID
) -> ChecklistRecord:
    """Run tolka_underlag on a notice's documents, `document_id` first, and store the verified result.

    A draft for inköp to review, or, when the review is turned off (decision 0011), a
    published checklist at once, with no `approved_at`, so the app says nobody reviewed it.
    Every current document of the notice goes with the main one (decision 0020), and the
    buyer's published answers too (decision 0018); the record keeps a digest of both, so
    that `interpret_changed` sees when they change.
    """

    document = await session.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumentet finns inte.")
    notice = await session.get(Notice, document.notice_id)
    if notice is None:
        raise NotFoundError("Upphandlingen finns inte.")
    material = await _material(session, notice, document)

    answers = await answer_inputs(session, notice.id)
    checklist, run = await engine.interpret_document(notice_context(notice), material.document_set, answers)
    await record_call(session, Task.INTERPRET_DOCUMENT, run, notice_id=notice.id)
    verified, summary = verify_checklist(checklist, material.paged, answers)
    summary.read = read_summary(material.document_set)
    document.interpret_attempts = 0
    document.interpret_error = None
    document.interpret_retry_at = None
    publish_now = not await review_required(session)
    record = ChecklistRecord(
        notice_id=notice.id,
        document_id=document_id,
        status=PUBLISHED if publish_now else DRAFT,
        published_at=utcnow() if publish_now else None,
        engine=run.engine,
        model=run.model,
        contract_version=CONTRACT_VERSION,
        payload=verified.model_dump(mode="json"),
        verification=summary.model_dump(),
        answers_digest=answers_digest(answers),
        documents_digest=documents_digest(material.documents),
        # Wall-clock time, not the transaction's: several drafts made in one transaction stay ordered.
        created_at=utcnow(),
    )
    session.add(record)
    await session.flush()
    await session.refresh(record)
    logger.info("Interpreted document %s with %s (%s attempts)", document_id, run.engine, run.attempts)
    return record


async def interpret_notice(
    session: AsyncSession, engine: AiEngine, notice_id: uuid.UUID
) -> list[ChecklistRecord]:
    """Interpret every document of a notice again (new drafts; earlier checklists are kept)."""

    document_ids = list(
        await session.scalars(
            select(Document.id)
            .where(Document.notice_id == notice_id, is_current())
            .order_by(Document.created_at)
        )
    )
    if not document_ids:
        raise NotFoundError("Upphandlingen har inga dokument att tolka.")
    return [await interpret_document(session, engine, document_id) for document_id in document_ids]


async def interpret_pending(
    session: AsyncSession, engine: AiEngine, *, limit: int = PENDING_BATCH_SIZE
) -> dict[str, int]:
    """Interpret documents that have no checklist yet, a few per run.

    Documents that never failed come first, then failed ones whose retry time has come,
    so a document that keeps failing never blocks newer ones. Each outcome is committed
    at once so that a slow engine does not lose finished work when a later document fails.
    """

    now = utcnow()
    has_checklist = exists().where(ChecklistRecord.document_id == Document.id)
    due = or_(Document.interpret_attempts == 0, Document.interpret_retry_at <= now)
    document_ids = list(
        await session.scalars(
            select(Document.id)
            .where(~has_checklist, is_current(), Document.page_count > 0, Document.auto_interpret, due)
            .order_by(Document.interpret_attempts, Document.created_at, Document.id)
            .limit(limit)
        )
    )
    interpreted = failed = gave_up = 0
    for document_id in document_ids:
        try:
            await interpret_document(session, engine, document_id)
        except (EngineError, InvalidInputError) as error:
            # The engine fails before anything is written, so only the failure needs storing.
            logger.warning("Interpretation of document %s failed", document_id, exc_info=True)
            document = await record_interpret_failure(session, document_id, error, utcnow())
            await session.commit()
            failed += 1
            gave_up += document is not None and document.interpret_retry_at is None
            continue
        await session.commit()
        interpreted += 1
    return {"pending": len(document_ids), "interpreted": interpreted, "failed": failed, "gave_up": gave_up}


# Set on a draft that a new interpretation replaced because the documents or the answers changed.
SUPERSEDED_NOTE = (
    "Ersatt av en ny tolkning: underlaget eller inköps publicerade svar i e-Avrop har ändrats "
    "sedan den förra."
)


async def interpret_changed(
    session: AsyncSession, engine: AiEngine, *, limit: int = PENDING_BATCH_SIZE
) -> dict[str, int]:
    """Interpret open notices again whose documents or published answers changed since their checklist.

    An answer can settle an open question or change a requirement (decision 0018), and a
    file the source added, replaced or an improved extraction re-read changes what the
    checklist should cover (decision 0020); both reach every supplier, so the checklist
    must follow. The notice's latest checklist decides: a published one gets a successor
    (a draft for inköp, or published at once with the review off), and a draft nobody has
    saved or commented on is replaced and marked so. A draft inköp has worked on, an
    approved checklist and a rejected one are left to inköp. A failure backs off and gives
    up as `interpret_pending` does, on the checklist's document, so a document that cannot
    succeed is not sent to the model every run. A few per run, each committed.
    """

    now = utcnow()
    notice_ids = list(
        await session.scalars(
            select(Notice.id)
            .where(Notice.status == "open", shown_notices(), exists().where(Document.notice_id == Notice.id))
            .order_by(Notice.deadline_at.asc().nulls_last(), Notice.id)
        )
    )
    interpreted = failed = 0
    for notice_id in notice_ids:
        if interpreted + failed >= limit:
            break
        latest = await latest_checklist(session, notice_id)
        if latest is None or not _follows_answers(latest):
            continue
        main = await session.get(Document, latest.document_id)
        if main is None or not await _changed_since(session, latest, main):
            continue
        if main.superseded_by is not None:
            main = await _successor(session, main) or main
        if not _may_try(main, now):
            continue
        try:
            await interpret_document(session, engine, main.id)
        except (EngineError, InvalidInputError) as error:
            # The engine fails before anything is written, so only the failure needs storing.
            logger.warning("Interpreting notice %s again after changes failed", notice_id, exc_info=True)
            await record_interpret_failure(session, main.id, error, utcnow())
            await session.commit()
            failed += 1
            continue
        if latest.status == DRAFT:
            latest.status = REJECTED
            latest.reviewer_note = SUPERSEDED_NOTE
        await session.commit()
        interpreted += 1
    return {"reinterpreted": interpreted, "reinterpret_failed": failed}


async def _changed_since(session: AsyncSession, record: ChecklistRecord, main: Document) -> bool:
    """Whether the answers or the documents differ from what the checklist was made from.

    A checklist without a documents digest was made from one document before decision 0020:
    it is outdated when the notice has more current documents than that one, and stays
    when that one document is all there is.
    """

    if answers_digest(await answer_inputs(session, record.notice_id)) != record.answers_digest:
        return True
    documents = await current_documents(session, record.notice_id, main=main)
    if record.documents_digest is None:
        return any(document.id != main.id for document in documents) or main.superseded_by is not None
    return documents_digest(documents) != record.documents_digest


async def _successor(session: AsyncSession, document: Document) -> Document | None:
    """The current version of a replaced main document, following the chain of replacements."""

    current = document
    seen = {current.id}
    while current.superseded_by is not None and current.superseded_by not in seen:
        seen.add(current.superseded_by)
        following = await session.get(Document, current.superseded_by)
        if following is None:
            return None
        current = following
    return current if current.superseded_by is None else None


def _follows_answers(record: ChecklistRecord) -> bool:
    """What a new interpretation may follow: a published checklist, or a draft inköp never saved."""

    if record.status == PUBLISHED:
        return True
    return record.status == DRAFT and record.edited_at is None and record.reviewer_note is None


def _may_try(document: Document, now: datetime) -> bool:
    """Not while a failure waits for its retry time, and never once the worker gave up on the document."""

    if document.interpret_attempts == 0:
        return True
    return document.interpret_retry_at is not None and document.interpret_retry_at <= now


def is_permanent_failure(error: Exception) -> bool:
    """True when retrying the same document cannot help.

    A document without readable text and a model that keeps breaking the contract after
    its repair attempts are permanent. Engines mark other errors with `retryable=False`
    (a document too large for the model, a request the provider rejects or cannot read).
    """

    if isinstance(error, InvalidInputError | EngineOutputError):
        return True
    return isinstance(error, EngineError) and not error.retryable


def retry_delay(attempts: int) -> timedelta:
    return min(RETRY_BASE_DELAY * 2 ** max(attempts - 1, 0), RETRY_MAX_DELAY)


async def record_interpret_failure(
    session: AsyncSession, document_id: uuid.UUID, error: Exception, now: datetime
) -> Document | None:
    """Count the failure and decide when to try again, or that the worker gives up."""

    document = await session.get(Document, document_id)
    if document is None:
        return None
    document.interpret_attempts += 1
    message = error.message if isinstance(error, InvalidInputError) else str(error)
    document.interpret_error = (message or type(error).__name__)[:MAX_ERROR_CHARS]
    give_up = is_permanent_failure(error) or document.interpret_attempts >= MAX_INTERPRET_ATTEMPTS
    document.interpret_retry_at = None if give_up else now + retry_delay(document.interpret_attempts)
    await session.flush()
    return document


async def reset_interpretation(session: AsyncSession, document_id: uuid.UUID) -> Document:
    """A buyer asks for a new interpretation: forget earlier failures.

    Asking also turns an attachment into one the worker interprets, if it fails now.
    """

    document = await session.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumentet finns inte.")
    if document.page_count == 0:
        raise ConflictError("Dokumentet innehåller ingen text att tolka.")
    document.interpret_attempts = 0
    document.interpret_error = None
    document.interpret_retry_at = None
    document.auto_interpret = True
    await session.flush()
    return document


async def list_interpretations(session: AsyncSession) -> list[InterpretationView]:
    """Documents still waiting for a checklist: new, retrying or given up (not attachments).

    Also a document whose new interpretation after inköp's published answers failed
    (decision 0018): it has a checklist, but the worker retries or has given up on the
    successor, and only inköp's "Tolka igen" gets a given-up one going again.
    """

    has_checklist = exists().where(ChecklistRecord.document_id == Document.id)
    waiting = and_(~has_checklist, Document.auto_interpret)
    reinterpreting = and_(has_checklist, Document.interpret_attempts > 0)
    rows = await session.execute(
        select(Document, Notice.title)
        .join(Notice, Notice.id == Document.notice_id)
        .where(or_(waiting, reinterpreting), is_current(), Document.page_count > 0, shown_notices())
        .order_by(Document.created_at.desc())
    )
    return [interpretation_view(document, title) for document, title in rows]


def interpretation_view(document: Document, notice_title: str) -> InterpretationView:
    return InterpretationView(
        document_id=document.id,
        notice_id=document.notice_id,
        notice_title=notice_title,
        filename=document.filename,
        state=interpretation_state(document),
        attempts=document.interpret_attempts,
        error=document.interpret_error,
        retry_at=document.interpret_retry_at,
        created_at=document.created_at,
    )


def interpretation_state(document: Document) -> InterpretationState:
    if document.interpret_attempts == 0:
        return "pending"
    return "retrying" if document.interpret_retry_at is not None else "failed"


# --- The buyer's review -------------------------------------------------------------


async def list_admin_checklists(
    session: AsyncSession, status: ChecklistStatus | None
) -> list[ChecklistAdminItem]:
    """The review queue: the soonest tender deadline first, then the newest interpretation."""

    query = (
        select(ChecklistRecord, Notice.title, Notice.deadline_at, Notice.deadline_kind)
        .join(Notice, Notice.id == ChecklistRecord.notice_id)
        .where(shown_notices())
    )
    if status is not None:
        query = query.where(ChecklistRecord.status == status)
    rows = await session.execute(
        query.order_by(
            Notice.deadline_at.asc().nulls_last(), ChecklistRecord.created_at.desc(), ChecklistRecord.id
        )
    )
    return [
        ChecklistAdminItem(
            id=record.id,
            notice_id=record.notice_id,
            notice_title=title,
            deadline_at=deadline_at,
            deadline_kind=deadline_kind(kind),
            status=_status(record.status),
            engine=record.engine,
            created_at=record.created_at,
            verification=VerificationSummary.model_validate(record.verification or {}),
            requirement_count=len(record.payload.get("requirements", [])),
        )
        for record, title, deadline_at, kind in rows
    ]


async def get_checklist(session: AsyncSession, checklist_id: uuid.UUID) -> ChecklistRecord:
    record = await session.get(ChecklistRecord, checklist_id)
    if record is None:
        raise NotFoundError("Checklistan finns inte.")
    return record


async def update_checklist(
    session: AsyncSession, checklist_id: uuid.UUID, update: ChecklistUpdate
) -> ChecklistRecord:
    """Store the buyer's edits. Citations are verified again, and the result needs a new approval."""

    record = await get_checklist(session, checklist_id)
    if record.status not in EDITABLE_STATUSES:
        raise ConflictError(
            "En publicerad checklista kan inte ändras. Tolka underlaget på nytt för att få ett nytt utkast."
        )
    main = await session.get(Document, record.document_id)
    if main is None:
        raise NotFoundError("Dokumentet finns inte.")
    paged = await load_paged_documents(session, await current_documents(session, record.notice_id, main=main))
    answers = await answer_inputs(session, record.notice_id)
    verified, summary = verify_checklist(update.checklist, paged or [], answers)
    previous = VerificationSummary.model_validate(record.verification or {})
    summary.read = previous.read  # what the interpretation read does not change with an edit
    record.payload = verified.model_dump(mode="json")
    record.verification = summary.model_dump()
    record.reviewer_note = update.reviewer_note
    record.edited_at = utcnow()  # inköp's work: new answers never replace this draft (decision 0018)
    record.status = DRAFT
    record.approved_by = None
    record.approved_at = None
    record.published_at = None  # set again when the corrected checklist is published
    await session.flush()
    return record


_NOT_APPROVABLE: dict[str, str] = {
    APPROVED: "Checklistan är redan godkänd.",
    PUBLISHED: "Checklistan är redan publicerad.",
    REJECTED: "En avvisad checklista kan inte godkännas. Öppna den som utkast igen och granska den först.",
}
_NOT_PUBLISHABLE: dict[str, str] = {
    PUBLISHED: "Checklistan är redan publicerad.",
    REJECTED: "En avvisad checklista kan inte publiceras. Öppna den som utkast igen och granska den först.",
}


async def approve_checklist(
    session: AsyncSession, checklist_id: uuid.UUID, user_id: uuid.UUID
) -> ChecklistRecord:
    """Only a draft is approved, so a rejection is never overturned without a new review."""

    record = await get_checklist(session, checklist_id)
    if record.status != DRAFT:
        raise ConflictError(_NOT_APPROVABLE.get(record.status, "Bara ett utkast kan godkännas."))
    record.status = APPROVED
    record.approved_by = user_id
    record.approved_at = utcnow()
    await session.flush()
    return record


async def publish_checklist(session: AsyncSession, checklist_id: uuid.UUID) -> ChecklistRecord:
    record = await get_checklist(session, checklist_id)
    if record.status != APPROVED:
        raise ConflictError(
            _NOT_PUBLISHABLE.get(record.status, "Checklistan måste godkännas innan den publiceras.")
        )
    record.status = PUBLISHED
    record.published_at = utcnow()
    await session.flush()
    return record


async def publish_pending(session: AsyncSession) -> int:
    """Publish each notice's latest draft or approved checklist: the review was turned off (decision 0011).

    Rejected and withdrawn checklists stay as they are; inköp said no to those.
    """

    rows = await session.scalars(
        select(ChecklistRecord)
        .where(ChecklistRecord.status.in_([DRAFT, APPROVED]))
        .order_by(ChecklistRecord.notice_id, ChecklistRecord.created_at.desc(), ChecklistRecord.id)
    )
    published = 0
    seen: set[uuid.UUID] = set()
    for record in rows:
        if record.notice_id in seen:
            continue
        seen.add(record.notice_id)
        record.status = PUBLISHED
        record.published_at = utcnow()
        published += 1
    await session.flush()
    return published


async def reopen_checklist(session: AsyncSession, checklist_id: uuid.UUID) -> ChecklistRecord:
    """A rejected or withdrawn checklist becomes a draft again, to be corrected and approved.

    The reviewer's note is kept: it is the reason for the rejection, which is what the
    buyer now corrects, and it stays until the buyer saves the checklist with a note of
    their own. Approval and publication are cleared, because the draft needs a new review;
    companies keep seeing whatever published checklist they saw before.
    """

    record = await get_checklist(session, checklist_id)
    if record.status != REJECTED:
        raise ConflictError("Bara en avvisad eller tillbakadragen checklista kan öppnas som utkast igen.")
    record.status = DRAFT
    record.approved_by = None
    record.approved_at = None
    record.published_at = None
    await session.flush()
    return record


async def withdraw_checklist(session: AsyncSession, checklist_id: uuid.UUID, note: str) -> ChecklistRecord:
    """Take a wrong published checklist away from companies, MCP, reminders and draft review.

    It becomes rejected with the buyer's reason and can be corrected and published
    again. The previous published checklist of the notice, if any, is shown meanwhile.
    The notice is touched so that matching assesses its matches again.
    """

    record = await get_checklist(session, checklist_id)
    if record.status != PUBLISHED:
        raise ConflictError("Bara en publicerad checklista kan dras tillbaka.")
    record.status = REJECTED
    record.reviewer_note = note
    notice = await session.get(Notice, record.notice_id)
    if notice is not None:
        notice.updated_at = utcnow()
    await session.flush()
    return record


async def reject_checklist(session: AsyncSession, checklist_id: uuid.UUID, note: str) -> ChecklistRecord:
    record = await get_checklist(session, checklist_id)
    if record.status not in {DRAFT, APPROVED}:
        raise ConflictError("Bara ett utkast eller en godkänd checklista kan avvisas.")
    record.status = REJECTED
    record.reviewer_note = note
    await session.flush()
    return record


_STATUSES: dict[str, ChecklistStatus] = {
    DRAFT: "draft",
    APPROVED: "approved",
    PUBLISHED: "published",
    REJECTED: "rejected",
}


def _status(value: str) -> ChecklistStatus:
    return _STATUSES[value]
