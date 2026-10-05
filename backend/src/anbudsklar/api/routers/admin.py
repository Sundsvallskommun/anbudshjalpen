"""The buyer's (inköpare) tools: checklist review, notices, documents, insights and jobs.

Every route needs the buyer persona, which a deployment can turn off (DEMO_BUYER_ENABLED).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status

from anbudsklar.api.deps import (
    BuyerDep,
    EngineDep,
    JobContextDep,
    SessionDep,
    SessionFactoryDep,
    require_buyer,
)
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import (
    ChecklistAdminItem,
    ChecklistStatus,
    ChecklistUpdate,
    ChecklistView,
    DocumentInfo,
    InsightItem,
    InterpretationView,
    JobName,
    JobRunView,
    NoticeCreate,
    NoticeDetail,
    RejectRequest,
)
from anbudsklar.api.uploads import UPLOAD_OPENAPI, read_upload
from anbudsklar.services import checklists, insights, jobs, notices, reminders
from anbudsklar.services.access import Viewer
from anbudsklar.services.background import interpret_in_background
from anbudsklar.services.dates import utcnow

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_buyer)])


@router.get("/checklists")
async def list_checklists(
    session: SessionDep, checklist_status: Annotated[ChecklistStatus | None, Query(alias="status")] = None
) -> list[ChecklistAdminItem]:
    return await checklists.list_admin_checklists(session, checklist_status)


@router.get("/checklists/{checklist_id}")
async def get_checklist(checklist_id: uuid.UUID, session: SessionDep) -> ChecklistView:
    return checklists.to_checklist_view(await checklists.get_checklist(session, checklist_id))


@router.put("/checklists/{checklist_id}")
async def update_checklist(
    checklist_id: uuid.UUID, body: ChecklistUpdate, session: SessionDep
) -> ChecklistView:
    """Edits are verified against the document again and need a new approval."""

    record = await checklists.update_checklist(session, checklist_id, body)
    await session.commit()
    return checklists.to_checklist_view(record)


@router.post("/checklists/{checklist_id}/approve")
async def approve_checklist(checklist_id: uuid.UUID, session: SessionDep, user: BuyerDep) -> ChecklistView:
    record = await checklists.approve_checklist(session, checklist_id, user.id)
    await session.commit()
    return checklists.to_checklist_view(record)


@router.post("/checklists/{checklist_id}/publish")
async def publish_checklist(checklist_id: uuid.UUID, session: SessionDep) -> ChecklistView:
    """Companies, MCP and draft review see it from now on; deadline reminders follow its dates."""

    record = await checklists.publish_checklist(session, checklist_id)
    await reminders.reschedule_for_notice(session, record.notice_id, utcnow())
    await session.commit()
    return checklists.to_checklist_view(record)


@router.post("/checklists/{checklist_id}/withdraw")
async def withdraw_checklist(
    checklist_id: uuid.UUID, body: RejectRequest, session: SessionDep
) -> ChecklistView:
    """Take a published checklist back, with the reason. It can then be corrected and published again."""

    record = await checklists.withdraw_checklist(session, checklist_id, body.note)
    await reminders.reschedule_for_notice(session, record.notice_id, utcnow())
    await session.commit()
    return checklists.to_checklist_view(record)


@router.post("/checklists/{checklist_id}/reject")
async def reject_checklist(
    checklist_id: uuid.UUID, body: RejectRequest, session: SessionDep
) -> ChecklistView:
    record = await checklists.reject_checklist(session, checklist_id, body.note)
    await session.commit()
    return checklists.to_checklist_view(record)


@router.post("/notices", status_code=status.HTTP_201_CREATED)
async def create_notice(body: NoticeCreate, session: SessionDep, user: BuyerDep) -> NoticeDetail:
    notice = await notices.create_notice(session, body)
    await session.commit()
    return await notices.notice_detail(session, notice.id, Viewer.for_user(user))


@router.post(
    "/notices/{notice_id}/documents",
    status_code=status.HTTP_201_CREATED,
    openapi_extra=UPLOAD_OPENAPI,
    dependencies=[Depends(rate_limited("interpret"))],
)
async def upload_document(
    notice_id: uuid.UUID,
    request: Request,
    background: BackgroundTasks,
    session: SessionDep,
    engine: EngineDep,
    session_factory: SessionFactoryDep,
    user: BuyerDep,
) -> DocumentInfo:
    """Store the document and interpret it right after the response has been sent."""

    upload = await read_upload(
        request,
        max_bytes=notices.MAX_DOCUMENT_BYTES,
        too_large_message="Dokumentet är för stort. Den största tillåtna storleken är 50 MB.",
    )
    document = await notices.attach_document(
        session, notice_id, filename=upload.filename, data=upload.data, uploaded_by=user.id
    )
    needs_checklist = not await checklists.has_checklist(session, document.id)
    await session.commit()
    if needs_checklist:
        background.add_task(interpret_in_background, session_factory, engine, document.id)
    return notices.document_info(document)


@router.get("/interpretations")
async def list_interpretations(session: SessionDep) -> list[InterpretationView]:
    """Documents without a checklist yet: waiting, retrying after a failure, or given up."""

    return await checklists.list_interpretations(session)


@router.post(
    "/documents/{document_id}/interpret",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limited("interpret"))],
)
async def interpret_document(
    document_id: uuid.UUID,
    background: BackgroundTasks,
    session: SessionDep,
    engine: EngineDep,
    session_factory: SessionFactoryDep,
) -> InterpretationView:
    """Interpret a document again now: after a failure the worker gave up on, or to get a new draft.

    Earlier checklists are kept; the result is a new draft for review.
    """

    document = await checklists.reset_interpretation(session, document_id)
    notice = await notices.get_notice(session, document.notice_id)
    view = checklists.interpretation_view(document, notice.title)
    await session.commit()
    background.add_task(interpret_in_background, session_factory, engine, document.id)
    return view


@router.get("/insights")
async def list_insights(session: SessionDep) -> list[InsightItem]:
    return await insights.list_insights(session, utcnow())


@router.get("/jobs")
async def list_jobs(session: SessionDep) -> list[JobRunView]:
    """The latest run of each job that has run, newest first."""

    return await jobs.latest_runs(session)


@router.post("/jobs/{job}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_job(
    job: JobName,
    background: BackgroundTasks,
    session: SessionDep,
    session_factory: SessionFactoryDep,
    context: JobContextDep,
) -> JobRunView:
    """Start a job now; it runs after the response, and GET /api/admin/jobs shows the outcome."""

    run = await jobs.start_run(session, job)
    await session.commit()
    background.add_task(jobs.complete_run, session_factory, run.id, job, jobs.JOBS[job], context)
    return JobRunView.model_validate(run)
