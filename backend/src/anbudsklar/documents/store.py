"""Storing procurement documents: the file on disk, the text per page in Postgres.

Files are content-addressed (`documents_dir/<sha256>`), so the same file uploaded to
several notices is stored once and a re-upload to the same notice is a no-op. Text is
extracted before anything is written, so an unsupported or unreadable upload leaves no
trace. The page rows carry the section label used to narrow searches.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import tempfile
import uuid
from pathlib import Path, PurePosixPath

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.contracts import PagedDocument
from anbudsklar.documents.extract import extract_pages, resolve_mimetype
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
    pages = await asyncio.to_thread(extract_pages, data, canonical_mimetype, filename)
    await asyncio.to_thread(_write_file, _documents_dir(), digest, data)

    document = Document(
        notice_id=notice_id,
        filename=safe_filename(filename),
        mimetype=canonical_mimetype,
        sha256=digest,
        size_bytes=len(data),
        page_count=len(pages),
        storage_path=digest,
        is_fictitious=is_fictitious,
        uploaded_by=uploaded_by,
        auto_interpret=auto_interpret,
    )
    document.pages = [
        DocumentPage(page_no=page_no, text=text, section=section)
        for page_no, (text, section) in enumerate(zip(pages, classify_pages(pages), strict=True), start=1)
    ]
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
    return PagedDocument(document_id=str(document.id), filename=document.filename, pages=pages)


def _stored_path(document: Document) -> Path:
    if not _SHA256_HEX.match(document.storage_path):
        raise ValueError(f"Unexpected storage path for document {document.id}")
    return _documents_dir() / document.storage_path


async def read_file(document: Document) -> bytes:
    """The original uploaded file."""

    return await asyncio.to_thread(_stored_path(document).read_bytes)
