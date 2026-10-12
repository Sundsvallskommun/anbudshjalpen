"""Notices as the app shows them: lists, details, document pages and manual entry."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import get_args

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import (
    DocumentInfo,
    Fit,
    MatchView,
    NoticeBuyer,
    NoticeBuyers,
    NoticeCounts,
    NoticeCreate,
    NoticeDetail,
    NoticeList,
    NoticeSort,
    NoticeStatus,
    NoticeSummary,
    PageView,
    PublishedAnswerView,
    UnreadFile,
)
from anbudsklar.contracts import Checklist, MatchAssessment
from anbudsklar.documents.extract import DocumentError
from anbudsklar.documents.store import is_current, store_document
from anbudsklar.models import Document, DocumentPage, MatchRecord, Notice, PublishedAnswer
from anbudsklar.search.queries import (
    count_notices_by_buyer,
    count_notices_by_status,
    cpv_labels,
    list_published_answers,
    notice_order,
    search_notices,
)
from anbudsklar.services.access import Viewer
from anbudsklar.services.checklists import (
    checklist_payload,
    checklist_progress,
    checklist_statuses,
    key_date,
    published_checklists,
    to_checklist_view,
    visible_checklist,
)
from anbudsklar.services.cpv import normalize_cpv_codes
from anbudsklar.services.dates import end_of_local_day, utcnow
from anbudsklar.services.errors import FileTooLargeError, NotFoundError
from anbudsklar.services.files import as_service_error, mimetype_for
from anbudsklar.visibility import is_shown

MANUAL_SOURCE = "manual"
OPEN = "open"
CLOSED = "closed"
PLANNED = "planned"
MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
_FITS: frozenset[str] = frozenset(get_args(Fit))


async def get_notice(session: AsyncSession, notice_id: uuid.UUID) -> Notice:
    notice = await session.get(Notice, notice_id)
    if notice is None or not is_shown(notice):
        raise NotFoundError("Upphandlingen finns inte.")
    return notice


async def get_document(session: AsyncSession, document_id: uuid.UUID) -> Document:
    document = await session.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumentet finns inte.")
    return document


async def first_document(session: AsyncSession, notice_id: uuid.UUID) -> Document | None:
    """The main procurement document: the first current one attached to the notice."""

    return await session.scalar(
        select(Document)
        .where(Document.notice_id == notice_id, is_current())
        .order_by(Document.created_at)
        .limit(1)
    )


def question_deadline(notice: Notice, checklist: Checklist | None) -> datetime | None:
    """Frågestopp as a moment: the source's own date first, else the published checklist's.

    e-Avrop states the last day for questions in its time table; a checklist's date is what
    a model read in the document, verified or not. Lists, Fråga AI and reminders all use
    this, so they never disagree about it.
    """

    if notice.question_deadline_at is not None:
        return notice.question_deadline_at
    day = key_date(checklist, "fragestopp") if checklist else None
    return end_of_local_day(day) if day else None


def default_sort(status: NoticeStatus | None, text: str | None) -> NoticeSort:
    """Open notices are about what to do next, so the soonest deadline comes first.

    Other lists are newest first, and a text search without a status puts the best
    match first.
    """

    if status == OPEN:
        return "deadline"
    return notice_order(None, text)


async def list_notices(
    session: AsyncSession,
    viewer: Viewer,
    *,
    text: str | None,
    status: NoticeStatus | None,
    cpv_prefixes: list[str],
    source: str | None,
    buyer: str | None = None,
    sort: NoticeSort | None = None,
    limit: int,
    offset: int,
) -> NoticeList:
    """One page of notices, with how many each status choice would list for the same filters."""

    text = text or None
    applied = notice_order(sort or default_sort(status, text), text)
    notices, total = await search_notices(
        session,
        text=text,
        cpv_prefixes=cpv_prefixes or None,
        status=status,
        source=source,
        buyer=buyer or None,
        order=applied,
        limit=limit,
        offset=offset,
    )
    per_status, everything = await count_notices_by_status(
        session,
        (OPEN, PLANNED),
        text=text,
        cpv_prefixes=cpv_prefixes or None,
        source=source,
        buyer=buyer or None,
    )
    return NoticeList(
        items=await notice_summaries(session, notices, viewer),
        total=total,
        counts=NoticeCounts(open=per_status[OPEN], planned=per_status[PLANNED], all=everything),
        sort=applied,
    )


async def list_buyers(
    session: AsyncSession,
    *,
    text: str | None,
    status: NoticeStatus | None,
    cpv_prefixes: list[str],
    source: str | None,
) -> NoticeBuyers:
    """The buyers for the list's buyer filter, counted with the list's other filters."""

    buyers = await count_notices_by_buyer(
        session, text=text or None, status=status, cpv_prefixes=cpv_prefixes or None, source=source
    )
    return NoticeBuyers(items=[NoticeBuyer(name=buyer.name, count=buyer.count) for buyer in buyers])


async def notice_summaries(
    session: AsyncSession, notices: Sequence[Notice], viewer: Viewer
) -> list[NoticeSummary]:
    """Summaries with what the viewer may know: checklist state and the company's fit."""

    ids = [notice.id for notice in notices]
    with_documents = await _notices_with_documents(session, ids)
    statuses = await checklist_statuses(session, ids, viewer)
    fits = await _fits(session, ids, viewer)
    labels = await cpv_labels(session, {code for notice in notices if (code := main_cpv_code(notice))})
    question_deadlines = await _question_deadlines(session, notices)
    now = utcnow()
    return [
        _summary(
            notice,
            status=effective_status(notice, now),
            has_documents=notice.id in with_documents,
            checklist_status=statuses[notice.id].status if notice.id in statuses else "none",
            checklist_reviewed=statuses[notice.id].reviewed if notice.id in statuses else False,
            fit=fits.get(notice.id),
            cpv_label=labels.get(main_cpv_code(notice) or ""),
            question_deadline=question_deadlines.get(notice.id),
        )
        for notice in notices
    ]


async def _question_deadlines(session: AsyncSession, notices: Sequence[Notice]) -> dict[uuid.UUID, datetime]:
    """Frågestopp per notice: the source's date, else the published checklist's (`question_deadline`)."""

    published = await published_checklists(
        session, [notice.id for notice in notices if notice.question_deadline_at is None]
    )
    deadlines: dict[uuid.UUID, datetime] = {}
    for notice in notices:
        record = published.get(notice.id)
        moment = question_deadline(notice, checklist_payload(record) if record else None)
        if moment is not None:
            deadlines[notice.id] = moment
    return deadlines


def main_cpv_code(notice: Notice) -> str | None:
    """The notice's main CPV code: the first one, as TED and e-Avrop list it."""

    return notice.cpv_codes[0] if notice.cpv_codes else None


def effective_status(notice: Notice, now: datetime) -> str:
    """The status as of now: an open notice whose deadline has passed is closed.

    The stored status is only rewritten by ingestion and the `close_expired` job, so it
    can lag behind the deadline by up to one job interval.
    """

    if notice.status == OPEN and notice.deadline_at is not None and notice.deadline_at <= now:
        return CLOSED
    return notice.status


async def close_expired_notices(session: AsyncSession, now: datetime) -> dict[str, int]:
    """Store `closed` on open notices whose deadline has passed, whatever their source.

    Search filters, the MCP tools and matching read the stored status. Manual and fixture
    notices are never ingested again, and TED and e-Avrop only once a day, so without
    this job a notice would be shown as open after its deadline.
    """

    closed = await session.scalars(
        update(Notice)
        .where(Notice.status == OPEN, Notice.deadline_at.is_not(None), Notice.deadline_at <= now)
        .values(status=CLOSED)
        .returning(Notice.id)
    )
    return {"closed": len(closed.all())}


def formal_question_url(notice: Notice, fallback: str) -> str:
    """Where a supplier asks a formal question: the procurement's page in e-Avrop when known.

    TED's own page has no question function, so a TED notice without a document link
    points to the municipality's page in e-Avrop instead (`fallback`, EAVROP_BASE_URL).
    """

    own_page = notice.url if notice.source != "ted" else None
    return notice.documents_url or own_page or fallback


async def notice_detail(session: AsyncSession, notice_id: uuid.UUID, viewer: Viewer) -> NoticeDetail:
    notice = await get_notice(session, notice_id)
    [summary] = await notice_summaries(session, [notice], viewer)
    documents = await session.scalars(
        select(Document)
        .where(Document.notice_id == notice.id, is_current())
        .order_by(Document.created_at, Document.filename, Document.id)
    )
    checklist = await visible_checklist(session, notice.id, viewer)
    progress = await checklist_progress(session, notice.id) if checklist is None else None
    match = await _match_record(session, notice.id, viewer)
    answers = await list_published_answers(session, notice.id)
    return NoticeDetail(
        **summary.model_dump(),
        description=notice.description,
        procedure=notice.procedure,
        url=notice.url,
        documents_url=notice.documents_url,
        place=notice.place,
        estimated_value_sek=notice.estimated_value_sek,
        cpv_labels=await cpv_labels(session, notice.cpv_codes or []),
        documents=[document_info(document) for document in documents],
        unread_files=[
            UnreadFile(filename=str(item.get("filename", "")), reason=str(item.get("reason", "")))
            for item in notice.unread_files or []
            if item.get("filename")
        ],
        checklist=to_checklist_view(checklist) if checklist else None,
        checklist_progress=progress,
        match=match_view(match, summary) if match else None,
        published_answers=[published_answer_view(answer) for answer in answers],
    )


def published_answer_view(answer: PublishedAnswer) -> PublishedAnswerView:
    return PublishedAnswerView(
        source=answer.source,
        key=answer.external_key,
        question=answer.question,
        answer=answer.answer,
        asked_at=answer.asked_at,
        answered_at=answer.answered_at,
    )


async def page_view(
    session: AsyncSession, notice_id: uuid.UUID, document_id: uuid.UUID, page_no: int
) -> PageView:
    document = await get_document(session, document_id)
    if document.notice_id != notice_id:
        raise NotFoundError("Dokumentet hör inte till den här upphandlingen.")
    page = await session.get(DocumentPage, (document_id, page_no))
    if page is None:
        raise NotFoundError(f"Sidan finns inte. Dokumentet har {document.page_count} sidor.")
    return PageView(document_id=document_id, page_no=page_no, page_count=document.page_count, text=page.text)


async def create_notice(session: AsyncSession, data: NoticeCreate) -> Notice:
    """A notice entered by a buyer, for procurements that are not (yet) in TED or e-Avrop."""

    now = utcnow()
    notice = Notice(
        source=MANUAL_SOURCE,
        external_id=uuid.uuid4().hex,
        title=data.title,
        buyer=data.buyer,
        reference_number=(data.reference_number or "").strip() or None,
        description=data.description,
        cpv_codes=normalize_cpv_codes(data.cpv_codes),
        notice_type="contract",
        procedure=data.procedure,
        status=OPEN if data.deadline_at is None or data.deadline_at > now else CLOSED,
        published_at=now,
        deadline_at=data.deadline_at,
        deadline_kind=data.deadline_kind,
        url=data.url,
        raw={},
    )
    session.add(notice)
    await session.flush()
    await session.refresh(notice)
    return notice


async def attach_document(
    session: AsyncSession, notice_id: uuid.UUID, *, filename: str, data: bytes, uploaded_by: uuid.UUID
) -> Document:
    """Store a procurement document. The same file uploaded twice returns the stored document.

    The first document of a notice is its main document and gets a checklist of its own.
    A later upload is an attachment (decision 0020): it is not interpreted on its own, and
    `interpret_changed` interprets the notice again with it within a few minutes.
    """

    if len(data) > MAX_DOCUMENT_BYTES:
        raise FileTooLargeError("Dokumentet är för stort. Den största tillåtna storleken är 50 MB.")
    mimetype = mimetype_for(filename)
    notice = await get_notice(session, notice_id)
    first = await first_document(session, notice.id) is None
    try:
        return await store_document(
            session,
            notice_id=notice.id,
            filename=filename,
            mimetype=mimetype,
            data=data,
            uploaded_by=uploaded_by,
            is_fictitious=notice.is_fictitious,
            auto_interpret=first,
        )
    except DocumentError as exc:
        raise as_service_error(exc) from exc


def notice_url(public_url: str, notice_id: uuid.UUID) -> str:
    """Link to the notice in the web app, for e-mails."""

    return page_url(public_url, f"upphandlingar/{notice_id}")


def page_url(public_url: str, path: str) -> str:
    """Link to a page of the web app ("start", "paminnelser"), for e-mails."""

    return f"{public_url.rstrip('/')}/{path.lstrip('/')}"


def document_info(document: Document) -> DocumentInfo:
    return DocumentInfo(
        id=document.id,
        filename=document.filename,
        page_count=document.page_count,
        empty_pages=document.empty_pages,
        is_fictitious=document.is_fictitious,
    )


def match_view(record: MatchRecord, notice: NoticeSummary) -> MatchView:
    assessment = MatchAssessment.model_validate(record.payload)
    return MatchView(
        id=record.id,
        notice=notice,
        fit=assessment.fit,
        assessment=assessment,
        engine=record.engine,
        created_at=record.created_at,
    )


def _summary(
    notice: Notice,
    *,
    status: str,
    has_documents: bool,
    checklist_status: str,
    checklist_reviewed: bool,
    fit: str | None,
    cpv_label: str | None,
    question_deadline: datetime | None,
) -> NoticeSummary:
    return NoticeSummary.model_validate(
        {
            "id": notice.id,
            "title": notice.title,
            "buyer": notice.buyer,
            "reference_number": notice.reference_number,
            "source": notice.source,
            "status": status,
            "published_at": notice.published_at,
            "deadline_at": notice.deadline_at,
            "deadline_kind": notice.deadline_kind,
            "question_deadline": question_deadline,
            "cpv_codes": list(notice.cpv_codes or []),
            "cpv_label": cpv_label,
            "has_documents": has_documents,
            "checklist_status": checklist_status,
            "checklist_reviewed": checklist_reviewed,
            "is_fictitious": notice.is_fictitious,
            "fit": fit if fit in _FITS else None,
        }
    )


async def _notices_with_documents(session: AsyncSession, ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not ids:
        return set()
    rows = await session.scalars(
        select(Document.notice_id).where(Document.notice_id.in_(ids), is_current()).distinct()
    )
    return set(rows)


async def _fits(session: AsyncSession, ids: list[uuid.UUID], viewer: Viewer) -> dict[uuid.UUID, str]:
    if not ids or viewer.company_id is None:
        return {}
    rows = await session.execute(
        select(MatchRecord.notice_id, MatchRecord.fit).where(
            MatchRecord.company_id == viewer.company_id,
            MatchRecord.notice_id.in_(ids),
            MatchRecord.stale.is_(False),
        )
    )
    return {notice_id: fit for notice_id, fit in rows}


async def _match_record(session: AsyncSession, notice_id: uuid.UUID, viewer: Viewer) -> MatchRecord | None:
    if viewer.company_id is None:
        return None
    return await session.scalar(
        select(MatchRecord).where(
            MatchRecord.company_id == viewer.company_id,
            MatchRecord.notice_id == notice_id,
            MatchRecord.stale.is_(False),
        )
    )
