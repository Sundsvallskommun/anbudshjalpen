"""The re-extraction job: stored files are read again when the extraction improves."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents import extract
from anbudsklar.documents.extract import TEXT_MIMETYPE
from anbudsklar.documents.store import store_document
from anbudsklar.models import Document, DocumentPage
from anbudsklar.services.documents import reextract_outdated
from api.factories import add_notice

PAGES = ["Administrativa föreskrifter.", "Anbudsgivaren ska ha ansvarsförsäkring."]


async def _text_document(
    session: AsyncSession, notice_id: object, filename: str, pages: list[str]
) -> Document:
    data = "\f".join(pages).encode()
    return await store_document(
        session,
        notice_id=notice_id,
        filename=filename,
        mimetype=TEXT_MIMETYPE,
        data=data,  # type: ignore[arg-type]
    )


async def test_outdated_documents_are_read_again_and_unreadable_ones_are_not_retried(
    db_session: AsyncSession,
) -> None:
    notice = await add_notice(db_session)
    outdated = await _text_document(db_session, notice.id, "u.txt", PAGES)
    current = await _text_document(db_session, notice.id, "ny.txt", ["Ny."])
    gone = await _text_document(db_session, notice.id, "borta.txt", ["Borta."])
    await db_session.execute(
        DocumentPage.__table__.update()
        .where(DocumentPage.document_id == outdated.id, DocumentPage.page_no == 2)
        .values(text="gammal text")
    )
    outdated.extraction_version = 1
    gone.extraction_version = 1
    gone.storage_path = "0" * 64  # the file is missing from the store
    await db_session.flush()

    assert await reextract_outdated(db_session) == {"reextracted": 1, "reextract_failed": 1}

    second = await db_session.scalar(
        select(DocumentPage.text).where(DocumentPage.document_id == outdated.id, DocumentPage.page_no == 2)
    )
    assert second is not None and "ansvarsförsäk" in second
    versions = {
        document.filename: document.extraction_version
        for document in await db_session.scalars(select(Document).where(Document.notice_id == notice.id))
    }
    assert versions == {name: extract.EXTRACTION_VERSION for name in ("u.txt", "ny.txt", "borta.txt")}
    assert current.extraction_version == extract.EXTRACTION_VERSION
    assert await reextract_outdated(db_session) == {"reextracted": 0, "reextract_failed": 0}
