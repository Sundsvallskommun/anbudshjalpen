"""Review of a tender draft against the published checklist (granska_utkast).

The draft never touches the database or the disk: the API reads the upload into
memory, the text is extracted here, sent to the engine and dropped when the request
ends. Nothing about the draft is logged; only that the engine was called, and what the
call cost in tokens, is recorded for the statistics on Drift (`services.ai_usage`).

A draft is one or several files (decision 0025): the tender and what the company means
to attach. The engine gets them as one `DocumentSet`, as it gets a procurement's
documents, and a quote names its file. The files share the limits one file has (bytes,
pages and text), and nothing is left out silently: a draft over them is refused, so the
review never says that something is missing because it was not read.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.api.schemas import ReviewView
from anbudsklar.contracts import DocumentSet, PagedDocument, Task
from anbudsklar.documents.citations import verify_review
from anbudsklar.documents.extract import MAX_CHARS, MAX_PAGES, DocumentError, extract_pages
from anbudsklar.services.ai_usage import TokenPrices, record_call, usage_view
from anbudsklar.services.checklists import checklist_payload, published_checklist
from anbudsklar.services.errors import ConflictError, FileTooLargeError, InvalidInputError
from anbudsklar.services.files import as_service_error, mimetype_for
from anbudsklar.services.notices import get_notice

MAX_DRAFT_BYTES = 20 * 1024 * 1024
MAX_DRAFT_FILES = 10
TOO_LARGE_MESSAGE = "Utkastet är för stort. Filerna får tillsammans vara högst 20 MB."


@dataclass(frozen=True)
class DraftFile:
    """One file of the draft as uploaded: its name and its bytes, in memory only."""

    filename: str
    data: bytes


async def review_draft(
    session: AsyncSession,
    engine: AiEngine,
    notice_id: uuid.UUID,
    *,
    files: Sequence[DraftFile],
    prices: TokenPrices | None = None,
) -> ReviewView:
    if not files:
        raise InvalidInputError("Välj en fil att granska.")
    if len(files) > MAX_DRAFT_FILES:
        raise InvalidInputError(f"Ladda upp högst {MAX_DRAFT_FILES} filer åt gången.")
    if sum(len(file.data) for file in files) > MAX_DRAFT_BYTES:
        raise FileTooLargeError(TOO_LARGE_MESSAGE)
    # An unsupported file is refused before anything is extracted or looked up.
    mimetypes = [mimetype_for(file.filename) for file in files]
    notice = await get_notice(session, notice_id)
    record = await published_checklist(session, notice.id)
    if record is None:
        raise ConflictError(
            "Upphandlingen har ingen publicerad checklista ännu, så utkastet kan inte granskas."
        )

    documents = [
        PagedDocument(filename=name, pages=await _extract(file.data, mimetype, file.filename))
        for file, mimetype, name in zip(files, mimetypes, _unique_names(files), strict=True)
    ]
    _check_text_limits(documents)
    checklist = checklist_payload(record)
    result, run = await engine.review_draft(checklist, DocumentSet.of(documents))
    await record_call(session, Task.REVIEW_DRAFT, run, notice_id=notice.id)
    return ReviewView(
        result=verify_review(result, documents),
        requirement_titles={requirement.id: requirement.title for requirement in checklist.requirements},
        engine=run.engine,
        usage=usage_view(run, prices),
    )


def _check_text_limits(documents: Sequence[PagedDocument]) -> None:
    """The files together may hold what one file may: the extractor's limits, said for the draft."""

    pages = sum(document.page_count for document in documents)
    chars = sum(len(page) for document in documents for page in document.pages)
    if pages > MAX_PAGES or chars > MAX_CHARS:
        limit = f"{MAX_CHARS:,}".replace(",", " ")  # Swedish digit grouping: 1 500 000
        raise FileTooLargeError(
            f"Utkastet är för långt. Filerna får tillsammans ha högst {MAX_PAGES} sidor och {limit} "
            "tecken text. Ta bort en bilaga som inte behövs för kraven och försök igen."
        )


def _unique_names(files: Sequence[DraftFile]) -> list[str]:
    """The names the engine sees. A quote names its file, so two files never share a name."""

    names: list[str] = []
    for file in files:
        name, number = file.filename, 1
        while name in names:
            number += 1
            name = f"{file.filename} ({number})"
        names.append(name)
    return names


async def _extract(data: bytes, mimetype: str, filename: str) -> list[str]:
    """Text extraction is CPU-bound (pypdf), so it runs off the event loop."""

    try:
        return await asyncio.to_thread(extract_pages, data, mimetype, filename)
    except DocumentError as exc:
        raise as_service_error(exc) from exc
