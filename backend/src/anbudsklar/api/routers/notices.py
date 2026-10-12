"""Notices, their documents, questions, draft review and deadline reminders."""

from __future__ import annotations

import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response, status

from anbudsklar.api.deps import (
    AiSlotsDep,
    EngineDep,
    SessionDep,
    SettingsDep,
    UserDep,
    ViewerDep,
    require_company_user,
)
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import (
    AnswerView,
    NoticeBuyers,
    NoticeDetail,
    NoticeList,
    NoticeSort,
    NoticeStatus,
    PageView,
    QuestionRequest,
    ReminderRequest,
    ReminderView,
    ReviewView,
)
from anbudsklar.api.uploads import UPLOAD_OPENAPI, read_upload
from anbudsklar.documents.store import read_file
from anbudsklar.services import notices, questions, reminders, review
from anbudsklar.services.ai_usage import token_prices
from anbudsklar.services.cpv import normalize_cpv_prefixes
from anbudsklar.services.dates import utcnow

router = APIRouter(tags=["notices"])

TextQuery = Annotated[str | None, Query(max_length=200, description="Fritext")]
StatusQuery = Annotated[NoticeStatus | None, Query(alias="status")]
CpvQuery = Annotated[
    list[str] | None, Query(description="CPV-prefix, 2–8 siffror; upprepa eller kommaseparera")
]
SourceQuery = Annotated[str | None, Query(max_length=32)]


@router.get("/notices")
async def list_notices(
    session: SessionDep,
    viewer: ViewerDep,
    q: TextQuery = None,
    notice_status: StatusQuery = None,
    cpv: CpvQuery = None,
    source: SourceQuery = None,
    buyer: Annotated[
        str | None, Query(max_length=300, description="Köpare: en del av namnet, oavsett skiftläge")
    ] = None,
    sort: Annotated[
        NoticeSort | None,
        Query(description="deadline, published eller relevance; standard: deadline för öppna, annars nyast"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NoticeList:
    """A page of notices. `counts` says how many each status choice would give with the same filters."""

    return await notices.list_notices(
        session,
        viewer,
        text=_stripped(q),
        status=notice_status,
        cpv_prefixes=normalize_cpv_prefixes(cpv or []),
        source=source,
        buyer=_stripped(buyer),
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/notices/buyers")
async def list_notice_buyers(
    session: SessionDep,
    q: TextQuery = None,
    notice_status: StatusQuery = None,
    cpv: CpvQuery = None,
    source: SourceQuery = None,
) -> NoticeBuyers:
    """The buyers for the list's buyer filter, each with what `GET /notices?buyer=` would total.

    Takes the list's other filters, so the counts match the list they filter. Declared before
    `/notices/{notice_id}`, which would otherwise take "buyers" for an id.
    """

    return await notices.list_buyers(
        session,
        text=_stripped(q),
        status=notice_status,
        cpv_prefixes=normalize_cpv_prefixes(cpv or []),
        source=source,
    )


@router.get("/notices/{notice_id}")
async def get_notice(notice_id: uuid.UUID, session: SessionDep, viewer: ViewerDep) -> NoticeDetail:
    return await notices.notice_detail(session, notice_id, viewer)


@router.get("/notices/{notice_id}/documents/{document_id}/pages/{page}")
async def get_page(
    notice_id: uuid.UUID, document_id: uuid.UUID, page: Annotated[int, Path(ge=1)], session: SessionDep
) -> PageView:
    return await notices.page_view(session, notice_id, document_id, page)


@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: uuid.UUID, session: SessionDep) -> Response:
    """The original file. Procurement documents are public, so no sign-in is needed."""

    document = await notices.get_document(session, document_id)
    try:
        data = await read_file(document)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Filen saknas i lagringen."
        ) from exc
    return Response(
        content=data,
        media_type=document.mimetype,
        headers={"Content-Disposition": _inline(document.filename), "Cache-Control": "private, max-age=3600"},
    )


@router.post("/notices/{notice_id}/questions", dependencies=[Depends(rate_limited("questions"))])
async def ask_question(
    notice_id: uuid.UUID,
    body: QuestionRequest,
    session: SessionDep,
    engine: EngineDep,
    viewer: ViewerDep,
    settings: SettingsDep,
    slots: AiSlotsDep,
) -> AnswerView:
    async with slots.hold():
        answer = await questions.ask_question(
            session,
            engine,
            notice_id,
            body,
            viewer,
            eavrop_url=settings.eavrop_base_url,
            prices=token_prices(settings),
        )
    await session.commit()
    return answer


@router.post(
    "/notices/{notice_id}/review",
    dependencies=[Depends(rate_limited("review")), Depends(require_company_user)],
    openapi_extra=UPLOAD_OPENAPI,
)
async def review_draft(
    notice_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    engine: EngineDep,
    slots: AiSlotsDep,
    settings: SettingsDep,
) -> ReviewView:
    """The draft is read into memory, reviewed and dropped. It is never stored or logged.

    The AI slot is taken after the upload has arrived, so a slow upload never holds one.
    The commit keeps only the record of the call for the statistics on Drift.
    """

    upload = await read_upload(
        request,
        max_bytes=review.MAX_DRAFT_BYTES,
        too_large_message="Utkastet är för stort. Den största tillåtna storleken är 20 MB.",
    )
    async with slots.hold():
        view = await review.review_draft(
            session,
            engine,
            notice_id,
            filename=upload.filename,
            data=upload.data,
            prices=token_prices(settings),
        )
    await session.commit()
    return view


@router.post("/notices/{notice_id}/reminders", status_code=status.HTTP_201_CREATED)
async def create_reminder(
    notice_id: uuid.UUID, body: ReminderRequest, session: SessionDep, user: UserDep
) -> ReminderView:
    reminder = await reminders.create_reminder(session, user.id, notice_id, body, utcnow())
    await session.commit()
    return reminder


def _stripped(value: str | None) -> str | None:
    return (value.strip() or None) if value else None


def _inline(filename: str) -> str:
    """Content-Disposition with an ASCII fallback and the exact UTF-8 name (RFC 6266)."""

    fallback = filename.encode("ascii", "replace").decode("ascii").replace('"', "")
    return f"inline; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"
