"""Result types of the read queries in `anbudsklar.search.queries`.

Plain frozen dataclasses rather than ORM rows, so that API services and MCP tools can
pass them around without an open database session.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from anbudsklar.contracts import CitationCheck

NoticeOrder = Literal["deadline", "published", "relevance"]
"""How `search_notices` orders its rows (see its docstring)."""


@dataclass(frozen=True, slots=True)
class BuyerCount:
    """A buyer named in the notices a search lists, and how many of them its name is in."""

    name: str
    count: int


@dataclass(frozen=True, slots=True)
class PageHit:
    """A document page that matches a search, with a highlighted snippet.

    `snippet` marks matched words with `**` (markdown bold). `rank` orders hits within
    one search only: full-text rank (ts_rank_cd) or trigram similarity in the fallback.
    """

    document_id: uuid.UUID
    filename: str
    page_no: int
    section: str | None
    snippet: str
    rank: float


@dataclass(frozen=True, slots=True)
class PageText:
    """The full text of one document page."""

    document_id: uuid.UUID
    filename: str
    page_no: int
    page_count: int
    section: str | None
    text: str


@dataclass(frozen=True, slots=True)
class QuoteCheck:
    """Whether a quote appears in a notice's documents, and where.

    `check` is verified (on `requested_page`, or anywhere when no page was given),
    moved (on `found_page` instead) or unverified. Unlike `Citation.found_page`,
    `found_page` here is set whenever the quote was found. `exact` is False for fuzzy
    matches; `excerpt` shows the matched passage in context, highlighted with `**`.
    """

    check: CitationCheck
    requested_page: int | None
    found_page: int | None = None
    document_id: uuid.UUID | None = None
    filename: str | None = None
    excerpt: str | None = None
    exact: bool = False
    score: float = 0.0
