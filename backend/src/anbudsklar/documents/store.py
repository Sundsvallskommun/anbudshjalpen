"""Storing procurement documents: the file on disk, the text per page in Postgres.

Files are content-addressed (`documents_dir/<sha256>`), so the same file uploaded to
several notices is stored once and a re-upload to the same notice is a no-op. Text is
extracted before anything is written, so an unsupported or unreadable upload leaves no
trace. The page rows carry the section label used to narrow searches.

A document row is never deleted by the app: a file the source replaced is marked
superseded (`supersede`), so that the source links of older checklists keep working, and
every reader of a notice's documents asks for the current ones (`current_documents`).
The stored file lets an improved extraction run again (`reextract_document`).
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import tempfile
import uuid
from collections.abc import Sequence
from pathlib import Path, PurePosixPath

from sqlalchemy import ColumnElement, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.contracts import PagedDocument
from anbudsklar.documents.extract import EXTRACTION_VERSION, extract_document, resolve_mimetype
from anbudsklar.documents.sections import classify_pages
from anbudsklar.models import Document, DocumentPage

MAX_FILENAME_CHARS = 200
_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


class DocumentNotFound(LookupError):
    """No document with the given id."""


def safe_filename(filename: str) -> str:
    """The base name of an uploaded file, without directories or control characters."""

    name = PurePosixPath(filename.replace("\\", "/")).name
    name = _CONTROL_CHARS.sub("", name).strip()
    if len(name) > MAX_FILENAME_CHARS:
        stem, dot, suffix = name.rpartition(".")
        keep = MAX_FILENAME_CHARS - len(suffix) - 1
        name = f"{stem[:keep]}.{suffix}" if dot and keep > 0 else name[:MAX_FILENAME_CHARS]
    return name or "dokument"


def _documents_dir() -> Path:
    return get_settings().documents_dir


def _write_file(directory: Path, digest: str, data: bytes) -> None:
    """Write atomically (temp file + rename) so readers never see a partial file."""

    directory.mkdir(parents=True, exist_ok=True)
    target = directory / digest
    if target.exists() and target.stat().st_size == len(data):
        return
    with tempfile.NamedTemporaryFile(dir=directory, prefix=f".{digest}.", delete=False) as handle:
        handle.write(data)
        temporary = Path(handle.name)
    os.replace(temporary, target)


async def _existing(session: AsyncSession, notice_id: uuid.UUID, digest: str) -> Document | None:
    return await session.scalar(
        select(Document).where(Document.notice_id == notice_id, Document.sha256 == digest)
    )


async def store_document(
    session: AsyncSession,
    *,
    notice_id: uuid.UUID,
    filename: str,
    mimetype: str,
    data: bytes,
    uploaded_by: uuid.UUID | None = None,
    is_fictitious: bool = False,
    auto_interpret: bool = True,
) -> Document:
    """Store a document for a notice and index its pages; returns the existing row on re-upload.

    Raises `anbudsklar.documents.extract.DocumentError` (with a Swedish message) when the
    file cannot be used. The caller commits the session.
    """

    digest = hashlib.sha256(data).hexdigest()
    existing = await _existing(session, notice_id, digest)
    if existing is not None:
        return existing

    canonical_mimetype = resolve_mimetype(mimetype, filename, data)
    pages, layout = await asyncio.to_thread(extract_document, data, canonical_mimetype, filename)
    await asyncio.to_thread(_write_file, _documents_dir(), digest, data)

    document = Document(
        notice_id=notice_id,
        filename=safe_filename(filename),
        mimetype=canonical_mimetype,
        sha256=digest,
        size_bytes=len(data),
        page_count=len(pages),
        empty_pages=count_empty(pages),
        layout=layout,
        extraction_version=EXTRACTION_VERSION,
        storage_path=digest,
        is_fictitious=is_fictitious,
        uploaded_by=uploaded_by,
        auto_interpret=auto_interpret,
    )
    document.pages = _page_rows(pages)
    try:
        async with session.begin_nested():
            session.add(document)
    except IntegrityError:
        # A concurrent upload of the same file won the race; use its row.
        concurrent = await _existing(session, notice_id, digest)
        if concurrent is None:
            raise
        return concurrent
    return document


def _page_rows(pages: Sequence[str]) -> list[DocumentPage]:
    return [
        DocumentPage(page_no=page_no, text=text, section=section)
        for page_no, (text, section) in enumerate(zip(pages, classify_pages(pages), strict=True), start=1)
    ]


def count_empty(pages: Sequence[str]) -> int:
    """Pages without readable text: scans and images, which the engines never see."""

    return sum(1 for page in pages if not page.strip())


def is_current() -> ColumnElement[bool]:
    """The condition that keeps the documents a notice has now: not replaced by a newer file."""

    return Document.superseded_by.is_(None)


async def current_documents(
    session: AsyncSession, notice_id: uuid.UUID, *, main: Document | None = None
) -> list[Document]:
    """A notice's current, readable documents, `main` first, then in the order they were stored.

    What the engines, the search and MCP read: a file the source replaced is left out, and
    so is one without text. `main` is the document a checklist or a question starts from.
    """

    documents = list(
        await session.scalars(
            select(Document)
            .where(Document.notice_id == notice_id, is_current(), Document.page_count > 0)
            .order_by(Document.created_at, Document.filename, Document.id)
        )
    )
    if main is None:
        return documents
    return [main, *(document for document in documents if document.id != main.id)]


async def load_paged_document(session: AsyncSession, document_id: uuid.UUID) -> PagedDocument:
    """The document as the AI engines and the citation verifier see it."""

    document = await session.get(Document, document_id)
    if document is None:
        raise DocumentNotFound(f"Document {document_id} does not exist")
    rows = await session.execute(
        select(DocumentPage.page_no, DocumentPage.text)
        .where(DocumentPage.document_id == document_id)
        .order_by(DocumentPage.page_no)
    )
    texts = {page_no: text for page_no, text in rows}
    pages = [texts.get(page_no, "") for page_no in range(1, max(texts, default=0) + 1)]
    return PagedDocument(
        document_id=str(document.id), filename=document.filename, pages=pages, layout=document.layout
    )


async def load_paged_documents(session: AsyncSession, documents: Sequence[Document]) -> list[PagedDocument]:
    """The documents as the engines see them, in the order given."""

    return [await load_paged_document(session, document.id) for document in documents]


def supersede(old: Document, new: Document) -> None:
    """Mark `old` as replaced by `new`, the source's newer file under the same name.

    The old row and its pages stay: a checklist interpreted from it still shows its sources.
    """

    if old.id != new.id:
        old.superseded_by = new.id


async def reextract_document(session: AsyncSession, document: Document) -> int:
    """Read the stored file again with the current extraction and replace the pages.

    Returns the new page count. Raises `DocumentError` when the file can no longer be
    read, in which case nothing is changed. A changed text changes the pages a checklist
    cites, so the caller's digest check interprets the notice again.
    """

    data = await read_file(document)
    pages, layout = await asyncio.to_thread(extract_document, data, document.mimetype, document.filename)
    await session.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
    session.add_all(DocumentPage(document_id=document.id, **_page_values(row)) for row in _page_rows(pages))
    document.page_count = len(pages)
    document.empty_pages = count_empty(pages)
    document.layout = layout
    document.extraction_version = EXTRACTION_VERSION
    await session.flush()
    return len(pages)


def _page_values(row: DocumentPage) -> dict[str, object]:
    return {"page_no": row.page_no, "text": row.text, "section": row.section}


def _stored_path(document: Document) -> Path:
    if not _SHA256_HEX.match(document.storage_path):
        raise ValueError(f"Unexpected storage path for document {document.id}")
    return _documents_dir() / document.storage_path


async def read_file(document: Document) -> bytes:
    """The original uploaded file."""

    return await asyncio.to_thread(_stored_path(document).read_bytes)
