"""Keeping stored documents' text up to date with the extraction.

The original files are kept on disk, so a better text extraction can reach what is
already stored instead of only what comes after it. `reextract_outdated` reads a few
files per run whose pages were made by an older `EXTRACTION_VERSION`; the checklist's
documents digest then tells `interpret_changed` to interpret the notice again.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.extract import EXTRACTION_VERSION, DocumentError
from anbudsklar.documents.store import is_current, reextract_document
from anbudsklar.models import Document

logger = logging.getLogger(__name__)

# Files per run: extraction is CPU work in the worker, and nothing waits for it.
REEXTRACT_BATCH_SIZE = 20


async def reextract_outdated(session: AsyncSession, *, limit: int = REEXTRACT_BATCH_SIZE) -> dict[str, int]:
    """Read again the current documents whose pages an older extraction made, a few per run.

    A file that the current extraction cannot read keeps its old pages and is counted; it
    is still marked with the current version, so that it is not tried again every run.
    Each document is committed on its own.
    """

    documents = list(
        await session.scalars(
            select(Document)
            .where(Document.extraction_version < EXTRACTION_VERSION, is_current())
            .order_by(Document.created_at, Document.id)
            .limit(limit)
        )
    )
    reextracted = failed = 0
    for document in documents:
        try:
            await reextract_document(session, document)
        except (DocumentError, OSError) as error:
            logger.warning("Document %s could not be read again: %s", document.id, error)
            document.extraction_version = EXTRACTION_VERSION
            failed += 1
        else:
            reextracted += 1
        await session.commit()
    return {"reextracted": reextracted, "reextract_failed": failed}
