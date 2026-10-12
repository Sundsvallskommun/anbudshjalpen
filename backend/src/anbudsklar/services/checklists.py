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
    ChecklistStatus,
    ChecklistUpdate,
    ChecklistView,
    InterpretationState,
    InterpretationView,
    VerificationSummary,
)
from anbudsklar.contracts import CONTRACT_VERSION, Checklist, deadline_kind
from anbudsklar.documents.citations import verify_checklist
from anbudsklar.documents.store import load_paged_document
from anbudsklar.models import ChecklistRecord, Document, Notice, PublishedAnswer
from anbudsklar.services.access import Viewer
from anbudsklar.services.answers import answer_inputs, answers_digest
from anbudsklar.services.app_settings import review_required
from anbudsklar.services.contexts import notice_context
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


async def interpret_document(
    session: AsyncSession, engine: AiEngine, document_id: uuid.UUID
) -> ChecklistRecord:
    """Run tolka_underlag on one document and store the verified result.

    A draft for inköp to review, or, when the review is turned off (decision 0011), a
    published checklist at once, with no `approved_at`, so the app says nobody reviewed it.
    The buyer's published answers go with the document (decision 0018), and the record
    keeps their digest, so that `interpret_answered` sees when they change.
    """

    document = await session.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumentet finns inte.")
    notice = await session.get(Notice, document.notice_id)
    if notice is None:
        raise NotFoundError("Upphandlingen finns inte.")
    paged = await load_paged_document(session, document_id)
    if not any(page.strip() for page in paged.pages):
        raise InvalidInputError("Dokumentet innehåller ingen läsbar text att tolka.")

    answers = await answer_inputs(session, notice.id)
    checklist, run = await engine.interpret_document(notice_context(notice), paged, answers)
    verified, summary = verify_checklist(checklist, paged.pages, answers)
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
            select(Document.id).where(Document.notice_id == notice_id).order_by(Document.created_at)
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
            .where(~has_checklist, Document.page_count > 0, Document.auto_interpret, due)
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


# Set on a draft that a new interpretation replaced because the answers changed.
SUPERSEDED_NOTE = "Ersatt av en ny tolkning som tar hänsyn till inköps senaste svar i e-Avrop."


async def interpret_answered(
    session: AsyncSession, engine: AiEngine, *, limit: int = PENDING_BATCH_SIZE
) -> dict[str, int]:
    """Interpret open notices again whose published answers changed since their checklist (decision 0018).

    An answer can settle an open question or change a requirement, and it reaches every
    supplier, so the checklist must follow it. The notice's latest checklist decides: a
    published one gets a successor (a draft for inköp, or published at once with the review
    off), and a draft nobody has saved or commented on is replaced and marked so. A draft
    inköp has worked on, an approved checklist and a rejected one are left to inköp. A
    failure backs off and gives up as `interpret_pending` does, on the checklist's document,
    so a document that cannot succeed is not sent to the model every run. A few per run,
    each committed.
    """

    now = utcnow()
    has_answers = exists().where(PublishedAnswer.notice_id == Notice.id)
    had_answers = exists().where(
        ChecklistRecord.notice_id == Notice.id, ChecklistRecord.answers_digest.is_not(None)
    )
    notice_ids = list(
        await session.scalars(
            select(Notice.id)
            .where(Notice.status == "open", shown_notices(), or_(has_answers, had_answers))
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
        if answers_digest(await answer_inputs(session, notice_id)) == latest.answers_digest:
            continue
        document = await session.get(Document, latest.document_id)
        if document is None or not _may_try(document, now):
            continue
        try:
            await interpret_document(session, engine, latest.document_id)
        except (EngineError, InvalidInputError) as error:
            # The engine fails before anything is written, so only the failure needs storing.
            logger.warning("Interpreting notice %s again after new answers failed", notice_id, exc_info=True)
            await record_interpret_failure(session, latest.document_id, error, utcnow())
            await session.commit()
            failed += 1
            continue
        if latest.status == DRAFT:
            latest.status = REJECTED
            latest.reviewer_note = SUPERSEDED_NOTE
        await session.commit()
        interpreted += 1
    return {"reinterpreted": interpreted, "reinterpret_failed": failed}


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
        .where(or_(waiting, reinterpreting), Document.page_count > 0, shown_notices())
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
    paged = await load_paged_document(session, record.document_id)
    answers = await answer_inputs(session, record.notice_id)
    verified, summary = verify_checklist(update.checklist, paged.pages, answers)
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
