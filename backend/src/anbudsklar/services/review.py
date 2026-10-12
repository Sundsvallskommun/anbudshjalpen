"""Review of a tender draft against the published checklist (granska_utkast).

The draft never touches the database or the disk: the API reads the upload into
memory, the text is extracted here, sent to the engine and dropped when the request
ends. Nothing about the draft is logged; only that the engine was called, and what the
call cost in tokens, is recorded for the statistics on Drift (`services.ai_usage`).
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.api.schemas import ReviewView
from anbudsklar.contracts import PagedDocument, Task
from anbudsklar.documents.citations import verify_review
from anbudsklar.documents.extract import DocumentError, extract_pages
from anbudsklar.services.ai_usage import TokenPrices, record_call, usage_view
from anbudsklar.services.checklists import checklist_payload, published_checklist
from anbudsklar.services.errors import ConflictError, FileTooLargeError
from anbudsklar.services.files import as_service_error, mimetype_for
from anbudsklar.services.notices import get_notice

MAX_DRAFT_BYTES = 20 * 1024 * 1024


async def review_draft(
    session: AsyncSession,
    engine: AiEngine,
    notice_id: uuid.UUID,
    *,
    filename: str,
    data: bytes,
    prices: TokenPrices | None = None,
) -> ReviewView:
    if len(data) > MAX_DRAFT_BYTES:
        raise FileTooLargeError("Utkastet är för stort. Den största tillåtna storleken är 20 MB.")
    mimetype = mimetype_for(filename)
    notice = await get_notice(session, notice_id)
    record = await published_checklist(session, notice.id)
    if record is None:
        raise ConflictError(
            "Upphandlingen har ingen publicerad checklista ännu, så utkastet kan inte granskas."
        )

    pages = await _extract(data, mimetype, filename)
    checklist = checklist_payload(record)
    result, run = await engine.review_draft(checklist, PagedDocument(filename=filename, pages=pages))
    await record_call(session, Task.REVIEW_DRAFT, run, notice_id=notice.id)
    return ReviewView(
        result=verify_review(result, pages),
        requirement_titles={requirement.id: requirement.title for requirement in checklist.requirements},
        engine=run.engine,
        usage=usage_view(run, prices),
    )


async def _extract(data: bytes, mimetype: str, filename: str) -> list[str]:
    """Text extraction is CPU-bound (pypdf), so it runs off the event loop."""

    try:
        return await asyncio.to_thread(extract_pages, data, mimetype, filename)
    except DocumentError as exc:
        raise as_service_error(exc) from exc
