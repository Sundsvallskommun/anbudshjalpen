"""Plain database reads that the shared search queries do not cover.

Only public procurement data is read here: notices, their documents, published
checklists and CPV labels. Company-owned tables (profiles, questions, matches,
reminders) are deliberately never imported in this package.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.store import is_current
from anbudsklar.models import ChecklistRecord, CpvCode, Document, Notice
from anbudsklar.visibility import is_shown

PUBLISHED = "published"


async def get_notice(session: AsyncSession, notice_id: uuid.UUID) -> Notice | None:
    notice = await session.get(Notice, notice_id)
    return notice if notice is not None and is_shown(notice) else None


async def list_documents(session: AsyncSession, notice_id: uuid.UUID) -> list[Document]:
    """The notice's current documents; a file the source replaced is left out."""

    result = await session.scalars(
        select(Document)
        .where(Document.notice_id == notice_id, is_current())
        .order_by(Document.created_at, Document.filename, Document.id)
    )
    return list(result)


async def get_document(session: AsyncSession, document_id: uuid.UUID) -> Document | None:
    return await session.get(Document, document_id)


async def latest_published_checklist(session: AsyncSession, notice_id: uuid.UUID) -> ChecklistRecord | None:
    """Only published checklists: drafts have not been reviewed by inköp yet."""

    result = await session.scalars(
        select(ChecklistRecord)
        .where(ChecklistRecord.notice_id == notice_id, ChecklistRecord.status == PUBLISHED)
        .order_by(ChecklistRecord.published_at.desc().nulls_last(), ChecklistRecord.created_at.desc())
        .limit(1)
    )
    return result.first()


async def has_published_checklist(session: AsyncSession, notice_id: uuid.UUID) -> bool:
    query = select(
        exists().where(ChecklistRecord.notice_id == notice_id, ChecklistRecord.status == PUBLISHED)
    )
    return bool(await session.scalar(query))


async def cpv_labels(session: AsyncSession, codes: Iterable[str]) -> dict[str, str]:
    wanted = {code.split("-")[0] for code in codes}
    if not wanted:
        return {}
    rows = await session.execute(select(CpvCode.code, CpvCode.label_sv).where(CpvCode.code.in_(wanted)))
    return {code: label for code, label in rows.tuples()}
