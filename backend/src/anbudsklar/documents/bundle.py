"""The documents a question is answered from, cut to a budget (decision 0012).

A procurement is several documents: the administrative conditions, requirement
specifications, contract terms and forms. The engine gets all of them, the main document
first, when their text fits `BUNDLE_BUDGET_CHARS`. Above the budget the main document is
kept whole and the rest is chosen: first the attachments the main document refers to where
it matches the question ("krav på entreprenören framgår av bilaga 6.6"), then the pages our
own search ranks highest. Pages left out keep their number and say so, so citations stay
right and the model can tell what it did not read.

Everything here is pure: the search hits come from the caller, so the choice is testable
without a database.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from anbudsklar.contracts import DocumentOutline, DocumentSet, PagedDocument

# About 40 000 tokens of Swedish: well inside the engines' windows, and still focused.
BUNDLE_BUDGET_CHARS = 150_000
OMITTED_PAGE_TEXT = "(sidan är inte med i urvalet)"
# "bilaga 6.6", "bil. 2", "enligt bilaga 1" and bare numbered headings such as "6.6" or "6.2.1".
_REFERENCE = re.compile(
    r"\b(?:bilaga|bil\.)\s*(\d+(?:\.\d+)*)|\b(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\b", re.IGNORECASE
)
# The number an attachment's name starts with: "6.6 Krav på Entreprenör.pdf", "Bilaga 1 Prisbilaga".
_FILENAME_KEY = re.compile(r"^\s*(?:bilaga\s*)?(\d+(?:\.\d+)*)\b", re.IGNORECASE)


@dataclass(frozen=True)
class PageRef:
    """One page of one document, as the search ranks them."""

    document_id: str
    page_no: int


def references_in(text: str) -> set[str]:
    """The attachment numbers a text points at: {"6.6", "1"} for "bilaga 1" and "se 6.6"."""

    return {group for match in _REFERENCE.finditer(text) for group in match.groups() if group}


def filename_key(filename: str) -> str | None:
    """The number an attachment's filename starts with, which references use to name it."""

    match = _FILENAME_KEY.match(filename)
    return match.group(1) if match else None


def _page_size(text: str) -> int:
    return len(text.strip())


def build_document_set(
    documents: Sequence[PagedDocument],
    *,
    hits: Iterable[PageRef] = (),
    budget_chars: int = BUNDLE_BUDGET_CHARS,
    unread_files: Sequence[str] = (),
) -> DocumentSet:
    """Choose what the engine reads. `documents[0]` is the main document.

    `unread_files` names the files of the procurement that were never read in (a format
    the extraction does not read, a file too large), so the model can say that they exist.
    """

    if not documents:
        return DocumentSet(documents=[], outline=[], unread_files=list(unread_files))
    hits = list(hits)
    total = sum(_page_size(page) for document in documents for page in document.pages)
    if total <= budget_chars:
        chosen = {_key(document): set(range(1, document.page_count + 1)) for document in documents}
    else:
        chosen = _choose(documents, hits, budget_chars)
    return DocumentSet(
        documents=[_cut(document, chosen[_key(document)]) for document in documents],
        outline=[
            DocumentOutline(
                document_id=document.document_id,
                filename=document.filename,
                page_count=document.page_count,
                pages_included=len(chosen[_key(document)]),
                layout=document.layout,
            )
            for document in documents
        ],
        unread_files=list(unread_files),
    )


def _key(document: PagedDocument) -> str:
    return document.document_id or document.filename


def _choose(documents: Sequence[PagedDocument], hits: list[PageRef], budget: int) -> dict[str, set[int]]:
    """The main document whole, then referenced attachments, then the best-ranked pages."""

    by_key = {_key(document): document for document in documents}
    chosen: dict[str, set[int]] = {key: set() for key in by_key}
    used = 0

    def take(key: str, page_no: int) -> bool:
        nonlocal used
        document = by_key[key]
        if page_no in chosen[key] or not 1 <= page_no <= document.page_count:
            return True
        size = _page_size(document.pages[page_no - 1])
        if used + size > budget:
            return False
        chosen[key].add(page_no)
        used += size
        return True

    main = documents[0]
    main_key = _key(main)
    for page_no in range(1, main.page_count + 1):
        if not take(main_key, page_no):
            return chosen  # the main document alone fills the budget

    # Attachments the main document names where it matches the question come whole. Without
    # hits in the main document, every reference in it counts: a short main document is
    # often little more than a list of the attachments that hold the requirements.
    main_hit_pages = [hit.page_no for hit in hits if hit.document_id == main_key]
    referencing_pages = main_hit_pages or range(1, main.page_count + 1)
    wanted = set().union(*(references_in(main.pages[page_no - 1]) for page_no in referencing_pages))
    for document in documents[1:]:
        if filename_key(document.filename) in wanted:
            for page_no in range(1, document.page_count + 1):
                if not take(_key(document), page_no):
                    return chosen

    for hit in hits:
        if hit.document_id in chosen and not take(hit.document_id, hit.page_no):
            return chosen
    return chosen


def _cut(document: PagedDocument, included: set[int]) -> PagedDocument:
    """The document with the pages left out replaced by a line that says so; numbering is kept."""

    if len(included) == document.page_count:
        return document
    pages = [
        text if page_no in included else OMITTED_PAGE_TEXT
        for page_no, text in enumerate(document.pages, start=1)
    ]
    return PagedDocument(
        document_id=document.document_id, filename=document.filename, pages=pages, layout=document.layout
    )
