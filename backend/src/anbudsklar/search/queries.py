"""Read queries for notices, document pages, LOU and CPV.

API services and MCP tools share these functions, so both see the same results. All
search runs in PostgreSQL (decision 0005):

- Full-text search with the Swedish configuration. `websearch_to_tsquery` accepts
  whatever people type (quotes, "or", minus) without syntax errors; results are ranked
  with `ts_rank_cd` and document snippets come from `ts_headline`.
- Questions in plain language ("vilka försäkringar krävs?") rarely have every word on
  one page, so document and LOU search retry with the words OR-ed before giving up.
- pg_trgm similarity is the last fallback, for what the Swedish stemmer cannot match,
  mainly compound words ("målningsarbete" against "Ommålning av …").
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from rapidfuzz import fuzz
from sqlalchemy import ColumnElement, Text, any_, false, func, literal, literal_column, or_, select, true
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.cpv import CPV_CODE, cpv_digits, cpv_prefix
from anbudsklar.documents.citations import HIGHLIGHT, PageIndex, QuoteMatch, excerpt, match_quote
from anbudsklar.models import CpvCode, Document, DocumentPage, LouSection, Notice, PublishedAnswer
from anbudsklar.search.types import BuyerCount, NoticeOrder, PageHit, PageText, QuoteCheck
from anbudsklar.visibility import shown_notices

SWEDISH = literal_column("'swedish'::regconfig")
STOCKHOLM = ZoneInfo("Europe/Stockholm")

NOTICE_TITLE_SIMILARITY = 0.3
"""Trigram word similarity needed for a notice title in the fallback search."""

PAGE_TEXT_SIMILARITY = 0.4
LOU_TEXT_SIMILARITY = 0.4
CPV_LABEL_SIMILARITY = 0.5

MAX_LIMIT = 100
MAX_SEARCH_TERMS = 12
SNIPPET_CONTEXT = 120

HEADLINE_OPTIONS = (
    f"StartSel={HIGHLIGHT}, StopSel={HIGHLIGHT}, MaxWords=35, MinWords=12, ShortWord=2, "
    'MaxFragments=2, FragmentDelimiter=" … "'
)

_WORD = re.compile(r"\w+")
_CPV_PARTIAL = re.compile(r"^\d{1,8}$")
_CPV_QUERY = re.compile(r"^\d{1,8}(?:-\d)?$")
_LOU_CHAPTER_REFERENCE = re.compile(
    r"(?<![\w.])(?P<chapter>\d{1,2})(?P<letter>\s*[a-z])?\s*kap\.?"
    r"\s*(?P<section>\d{1,3})\s*(?P<suffix>[a-z])?\s*§",
    re.IGNORECASE,
)
_LOU_COLON_REFERENCE = re.compile(
    r"^\s*(?:lou\s+)?(?P<chapter>\d{1,2})\s*:\s*(?P<section>\d{1,3})\s*(?P<suffix>[a-z])?\s*$",
    re.IGNORECASE,
)
_LOU_SECTION = re.compile(r"^\s*(?P<number>\d{1,3})\s*(?P<suffix>[a-z])?\s*§?\s*$", re.IGNORECASE)


# --- Shared helpers -------------------------------------------------------------------


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


def _tsquery(text: str) -> ColumnElement[Any]:
    return func.websearch_to_tsquery(SWEDISH, text)


def _words(text: str) -> list[str]:
    """Distinct words in order, without the websearch operator "or"."""

    words = (word for word in _WORD.findall(text) if word.lower() != "or")
    return list(dict.fromkeys(words))[:MAX_SEARCH_TERMS]


def _fulltext_variants(query: str) -> list[str]:
    """The query as typed, then (for several words) the same words OR-ed."""

    words = _words(query)
    return [query, " or ".join(words)] if len(words) > 1 else [query]


def _as_datetime(value: date | datetime) -> datetime:
    """A timezone-aware instant; dates and naive times are read as Swedish local time."""

    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=STOCKHOLM)
    return datetime.combine(value, time.min, tzinfo=STOCKHOLM)


# --- CPV codes ------------------------------------------------------------------------


def cpv_with_ancestors(code: str) -> list[str]:
    """The code followed by its ancestors up to the division, most specific first.

    Parents follow the CPV digit hierarchy: the last significant digit becomes zero,
    so "45442110" gives 45442110, 45442100, 45442000, 45440000, 45400000, 45000000.
    """

    digits = cpv_digits(code)
    chain = [digits]
    significant = digits.rstrip("0")
    while len(significant) > 2:
        significant = significant[:-1].rstrip("0")
        chain.append(significant.ljust(8, "0"))
    return chain


def _cpv_like_pattern(value: str) -> str | None:
    """LIKE pattern for a CPV filter value: a full code covers its descendants."""

    value = value.strip()
    if CPV_CODE.match(value):
        return f"{cpv_prefix(value)}%"
    if _CPV_PARTIAL.match(value):
        return f"{value}%"
    return None


def _cpv_condition(prefixes: Sequence[str]) -> ColumnElement[bool]:
    """True when any of the notice's CPV codes starts with any of the prefixes."""

    patterns = sorted({p for value in prefixes if (p := _cpv_like_pattern(value)) is not None})
    if not patterns:
        return false()
    code = func.unnest(Notice.cpv_codes).table_valued("code").render_derived()
    any_pattern = any_(array(patterns, type_=Text))
    return select(literal(1)).select_from(code).where(code.c.code.like(any_pattern)).exists()


async def _content_terms(session: AsyncSession, text: str) -> list[str]:
    """The words of `text` that are not Swedish stop words, as Postgres decides."""

    words = [word.lower() for word in _words(text) if not word.isdigit()]
    if not words:
        return []
    candidate = func.unnest(array(words, type_=Text)).table_valued("word").render_derived()
    stmt = select(candidate.c.word).where(func.numnode(func.plainto_tsquery(SWEDISH, candidate.c.word)) > 0)
    return list(dict.fromkeys((await session.scalars(stmt)).all()))


def _cpv_code_query(query: str) -> str | None:
    """A code prefix when the query is (part of) a CPV code rather than words."""

    compact = re.sub(r"\s", "", query)
    if not _CPV_QUERY.match(compact):
        return None
    return cpv_prefix(compact) if CPV_CODE.match(compact) else compact


async def cpv_labels(session: AsyncSession, codes: Iterable[str]) -> dict[str, str]:
    """Swedish labels of the codes that are in the CPV list, keyed by the code as given.

    A code with check digit ("45442110-1") gets the label of its eight digits; codes that
    are malformed or unknown are left out, so a caller never shows a made-up label.
    """

    digits: dict[str, str] = {}
    for code in codes:
        try:
            digits[code] = cpv_digits(code)
        except ValueError:
            continue
    if not digits:
        return {}
    rows = await session.execute(
        select(CpvCode.code, CpvCode.label_sv).where(CpvCode.code.in_(set(digits.values())))
    )
    labels: dict[str, str] = {code: label for code, label in rows}
    return {code: labels[eight] for code, eight in digits.items() if eight in labels}


# A code with this many significant digits at most is an area (division or group) a model
# chooses among first: "45000000" (2) and "45400000" (3), not "45440000" (4).
CPV_AREA_DIGITS = 3


async def cpv_areas(session: AsyncSession) -> list[CpvCode]:
    """The divisions and groups of the whole CPV list: about 320 rows, few enough to show a model."""

    stmt = (
        select(CpvCode)
        .where(func.length(func.rtrim(CpvCode.code, "0")) <= CPV_AREA_DIGITS)
        .order_by(CpvCode.code)
    )
    return list(await session.scalars(stmt))


async def cpv_descendants(session: AsyncSession, codes: Iterable[str], *, limit: int) -> list[CpvCode]:
    """The codes under any of `codes`, the codes themselves included, broad ones first."""

    patterns = sorted({f"{cpv_prefix(code)}%" for code in codes})
    if not patterns:
        return []
    stmt = (
        select(CpvCode)
        .where(CpvCode.code.like(any_(array(patterns, type_=Text))))
        .order_by(CpvCode.level, CpvCode.code)
        .limit(limit)
    )
    return list(await session.scalars(stmt))


async def search_cpv(session: AsyncSession, query: str, limit: int = 20) -> list[CpvCode]:
    """CPV codes by code prefix (digits) or by label words (full text plus trigrams).

    Labels are short and full of compounds, so any word may match ("målning" finds
    "Målning av byggnader" and "Målnings- och glasarbeten"); codes matching more words
    and closer spellings rank first, then general codes before specific ones.
    """

    query = query.strip()
    if not query:
        return []
    code_prefix = _cpv_code_query(query)
    if code_prefix is not None:
        stmt = select(CpvCode).where(CpvCode.code.startswith(code_prefix, autoescape=True))
        return list(await session.scalars(stmt.order_by(CpvCode.level, CpvCode.code).limit(_clamp(limit))))
    terms = await _content_terms(session, query)
    if not terms:
        return []
    tsquery = _tsquery(" or ".join(terms))
    similarity = func.greatest(*(func.word_similarity(term, CpvCode.label_sv) for term in terms))
    score = func.ts_rank_cd(CpvCode.search, tsquery) + similarity
    stmt = (
        select(CpvCode)
        .where(or_(CpvCode.search.op("@@")(tsquery), similarity >= CPV_LABEL_SIMILARITY))
        .order_by(score.desc(), CpvCode.level, CpvCode.code)
        .limit(_clamp(limit))
    )
    return list(await session.scalars(stmt))


# --- Notices --------------------------------------------------------------------------


def _notice_filters(
    *,
    cpv_prefixes: Sequence[str] | None,
    status: str | None,
    source: str | None,
    deadline_after: date | datetime | None,
    buyer: str | None = None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [shown_notices()]
    if cpv_prefixes:
        conditions.append(_cpv_condition(cpv_prefixes))
    if status:
        conditions.append(Notice.status == status)
    if source:
        conditions.append(Notice.source == source)
    if deadline_after is not None:
        conditions.append(Notice.deadline_at >= _as_datetime(deadline_after))
    if buyer:
        conditions.append(_buyer_condition(buyer))
    return conditions


def _buyer_condition(buyer: str) -> ColumnElement[bool]:
    """The buyer field contains the text, whatever its case.

    A joint procurement lists all its buyers in one field ("Timrå kommun, Sundsvalls kommun"),
    so containment finds it under each of them. `count_notices_by_buyer` counts the same way.
    """

    return func.strpos(func.lower(Notice.buyer), func.lower(buyer)) > 0


async def _notice_page(
    session: AsyncSession,
    conditions: Sequence[ColumnElement[bool]],
    order_by: Sequence[Any],
    limit: int,
    offset: int,
) -> tuple[list[Notice], int]:
    total = await session.scalar(select(func.count()).select_from(Notice).where(*conditions)) or 0
    if total == 0 or offset >= total:
        return [], total
    stmt = select(Notice).where(*conditions).order_by(*order_by).limit(_clamp(limit)).offset(offset)
    return list(await session.scalars(stmt)), total


_NEWEST_FIRST = (Notice.published_at.desc().nulls_last(), Notice.created_at.desc(), Notice.id)
_SOONEST_DEADLINE_FIRST = (
    Notice.deadline_at.asc().nulls_last(),
    Notice.published_at.desc().nulls_last(),
    Notice.id,
)


def notice_order(order: NoticeOrder | None, text: str | None) -> NoticeOrder:
    """The order `search_notices` applies: relevance only means something with text."""

    has_text = bool((text or "").strip())
    if order is None:
        return "relevance" if has_text else "published"
    return "published" if order == "relevance" and not has_text else order


def _fixed_order(order: NoticeOrder) -> tuple[Any, ...]:
    return _SOONEST_DEADLINE_FIRST if order == "deadline" else _NEWEST_FIRST


def _text_conditions(query: str) -> tuple[ColumnElement[bool], ColumnElement[bool]]:
    """The full-text match, and the title similarity `search_notices` falls back to."""

    return (
        Notice.search.op("@@")(_tsquery(query)),
        func.word_similarity(query, Notice.title) >= NOTICE_TITLE_SIMILARITY,
    )


async def search_notices(
    session: AsyncSession,
    *,
    text: str | None = None,
    cpv_prefixes: Sequence[str] | None = None,
    status: str | None = None,
    source: str | None = None,
    deadline_after: date | datetime | None = None,
    buyer: str | None = None,
    order: NoticeOrder | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Notice], int]:
    """Notices matching the filters, as (page of rows, total count).

    `cpv_prefixes` takes code prefixes ("45", "4544") or full codes; a full code also
    matches its descendants ("45440000" matches "45442110"). With `text`, full-text
    matches are returned; when there are none, titles similar to the text (trigrams).
    `buyer` keeps notices whose buyer contains it, ignoring case.

    `order` (see `notice_order` for the default): "deadline" puts the soonest sista
    anbudsdag first and notices without one last, "published" the newest first, and
    "relevance" the best text match first. Relationships (documents, checklists) are not
    loaded.
    """

    offset = max(0, offset)
    conditions = _notice_filters(
        cpv_prefixes=cpv_prefixes, status=status, source=source, deadline_after=deadline_after, buyer=buyer
    )
    query = (text or "").strip()
    applied = notice_order(order, query)
    if not query:
        return await _notice_page(session, conditions, _fixed_order(applied), limit, offset)

    fulltext, similar = _text_conditions(query)
    relevance = (
        func.ts_rank_cd(Notice.search, _tsquery(query)).desc(),
        Notice.deadline_at.asc().nulls_last(),
        Notice.id,
    )
    rows, total = await _notice_page(
        session,
        [*conditions, fulltext],
        relevance if applied == "relevance" else _fixed_order(applied),
        limit,
        offset,
    )
    if total:
        return rows, total
    similarity = func.word_similarity(query, Notice.title)
    similar_order = (similarity.desc(), Notice.id) if applied == "relevance" else _fixed_order(applied)
    return await _notice_page(session, [*conditions, similar], similar_order, limit, offset)


async def _status_counts(session: AsyncSession, conditions: Sequence[ColumnElement[bool]]) -> dict[str, int]:
    rows = await session.execute(
        select(Notice.status, func.count()).where(*conditions).group_by(Notice.status)
    )
    return {status: count for status, count in rows}


async def count_notices_by_status(
    session: AsyncSession,
    statuses: Sequence[str],
    *,
    text: str | None = None,
    cpv_prefixes: Sequence[str] | None = None,
    source: str | None = None,
    deadline_after: date | datetime | None = None,
    buyer: str | None = None,
) -> tuple[dict[str, int], int]:
    """How many notices `search_notices` gives with each of `statuses`, and with no status.

    Returns (count per status, count for all statuses) for the same filters, so a list can
    show what each status choice holds before it is made. Every count falls back to title
    similarity on its own, exactly as `search_notices` does when its full-text search
    finds nothing for that status.
    """

    conditions = _notice_filters(
        cpv_prefixes=cpv_prefixes, status=None, source=source, deadline_after=deadline_after, buyer=buyer
    )
    query = (text or "").strip()
    if not query:
        counts = await _status_counts(session, conditions)
        return {status: counts.get(status, 0) for status in statuses}, sum(counts.values())

    fulltext, similar = _text_conditions(query)
    found = await _status_counts(session, [*conditions, fulltext])
    per_status = {status: found.get(status, 0) for status in statuses}
    total = sum(found.values())
    if total and all(per_status.values()):
        return per_status, total
    near = await _status_counts(session, [*conditions, similar])
    return (
        {status: count or near.get(status, 0) for status, count in per_status.items()},
        total or sum(near.values()),
    )


_BUYER_SEPARATOR = r"\s*,\s*"
"""Between the buyers of a joint procurement; ingestion joins TED's buyer list with ", "."""


async def count_notices_by_buyer(
    session: AsyncSession,
    *,
    text: str | None = None,
    cpv_prefixes: Sequence[str] | None = None,
    status: str | None = None,
    source: str | None = None,
    deadline_after: date | datetime | None = None,
) -> list[BuyerCount]:
    """The buyers of the notices `search_notices` lists with these filters, and their counts.

    The buyers of a joint procurement are listed one by one, grouped regardless of case and
    spelled as most notices spell them. A buyer's count is the total `search_notices` gives
    with `buyer` set to that name and the same filters: it counts every notice whose buyer
    contains the name, and with text it falls back to similar titles for that buyer alone,
    as the search does when the full-text search finds nothing for it. Buyers with the most
    notices come first, then by name.
    """

    conditions = _notice_filters(
        cpv_prefixes=cpv_prefixes, status=status, source=source, deadline_after=deadline_after
    )
    query = (text or "").strip()
    found: ColumnElement[bool] = true()
    near: ColumnElement[bool] = false()
    if query:
        found, near = _text_conditions(query)
        conditions.append(or_(found, near))
    listed = (
        select(Notice.buyer, found.label("found"), near.label("near"))
        .where(*conditions, Notice.buyer.is_not(None))
        .cte("listed")
    )
    parts = select(
        func.btrim(func.regexp_split_to_table(listed.c.buyer, _BUYER_SEPARATOR)).label("name")
    ).subquery("parts")
    key = func.lower(parts.c.name)
    names = (
        select(key.label("key"), func.mode().within_group(parts.c.name).label("name"))
        .where(parts.c.name != "")
        .group_by(key)
        .subquery("names")
    )
    stmt = (
        select(names.c.name, func.count().filter(listed.c.found), func.count().filter(listed.c.near))
        .select_from(names)
        .join(listed, func.strpos(func.lower(listed.c.buyer), names.c.key) > 0)
        .group_by(names.c.key, names.c.name)
    )
    counts = [
        BuyerCount(name=name, count=in_text or similar)
        for name, in_text, similar in await session.execute(stmt)
        if in_text or similar
    ]
    return sorted(counts, key=lambda buyer: (-buyer.count, buyer.name.casefold()))


# --- Document pages -------------------------------------------------------------------


def _page_scope(
    notice_id: uuid.UUID,
    sections: Sequence[str] | None,
    first_page: int | None,
    last_page: int | None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [Document.notice_id == notice_id]
    if sections:
        conditions.append(DocumentPage.section.in_(list(sections)))
    if first_page is not None:
        conditions.append(DocumentPage.page_no >= first_page)
    if last_page is not None:
        conditions.append(DocumentPage.page_no <= last_page)
    return conditions


def _squash(text: str) -> str:
    return " ".join(text.split())


async def _fulltext_page_hits(
    session: AsyncSession, scope: Sequence[ColumnElement[bool]], query: str, limit: int
) -> list[PageHit]:
    tsquery = _tsquery(query)
    rank = func.ts_rank_cd(DocumentPage.search, tsquery)
    snippet = func.ts_headline(SWEDISH, DocumentPage.text, tsquery, HEADLINE_OPTIONS)
    stmt = (
        select(
            DocumentPage.document_id,
            Document.filename,
            DocumentPage.page_no,
            DocumentPage.section,
            snippet.label("snippet"),
            rank.label("rank"),
        )
        .join(Document, Document.id == DocumentPage.document_id)
        .where(*scope, DocumentPage.search.op("@@")(tsquery))
        .order_by(rank.desc(), DocumentPage.page_no, DocumentPage.document_id)
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        PageHit(
            row.document_id, row.filename, row.page_no, row.section, _squash(row.snippet), float(row.rank)
        )
        for row in rows
    ]


def _similarity_snippet(query: str, text: str) -> str:
    """A snippet around the passage most similar to the query (ts_headline cannot help here)."""

    lowered = text.lower()
    haystack = lowered if len(lowered) == len(text) else text
    alignment = fuzz.partial_ratio_alignment(query.lower(), haystack)
    start, end = (alignment.dest_start, alignment.dest_end) if alignment else (0, 0)
    return excerpt(text, start, end, context=SNIPPET_CONTEXT)


async def _similar_page_hits(
    session: AsyncSession, scope: Sequence[ColumnElement[bool]], query: str, limit: int
) -> list[PageHit]:
    similarity = func.word_similarity(query, DocumentPage.text)
    stmt = (
        select(
            DocumentPage.document_id,
            Document.filename,
            DocumentPage.page_no,
            DocumentPage.section,
            DocumentPage.text,
            similarity.label("rank"),
        )
        .join(Document, Document.id == DocumentPage.document_id)
        .where(*scope, similarity >= PAGE_TEXT_SIMILARITY)
        .order_by(similarity.desc(), DocumentPage.page_no, DocumentPage.document_id)
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        PageHit(
            row.document_id,
            row.filename,
            row.page_no,
            row.section,
            _similarity_snippet(query, row.text),
            float(row.rank),
        )
        for row in rows
    ]


async def search_document(
    session: AsyncSession,
    notice_id: uuid.UUID,
    query: str,
    *,
    sections: Sequence[str] | None = None,
    first_page: int | None = None,
    last_page: int | None = None,
    limit: int = 8,
) -> list[PageHit]:
    """Pages of a notice's documents that answer `query`, best first.

    Tries all words, then any word, then trigram similarity. `sections` and the page
    range narrow the search (see `anbudsklar.documents.sections` for section names).
    """

    query = query.strip()
    if not query:
        return []
    scope = _page_scope(notice_id, sections, first_page, last_page)
    for variant in _fulltext_variants(query):
        hits = await _fulltext_page_hits(session, scope, variant, _clamp(limit))
        if hits:
            return hits
    return await _similar_page_hits(session, scope, query, _clamp(limit))


async def _notice_document(
    session: AsyncSession, notice_id: uuid.UUID, document_id: uuid.UUID | None
) -> Document | None:
    stmt = select(Document).where(Document.notice_id == notice_id)
    if document_id is not None:
        stmt = stmt.where(Document.id == document_id)
    stmt = stmt.order_by(Document.created_at, Document.filename, Document.id).limit(1)
    return await session.scalar(stmt)


async def read_pages(
    session: AsyncSession,
    notice_id: uuid.UUID,
    first: int,
    last: int,
    document_id: uuid.UUID | None = None,
) -> list[PageText]:
    """Pages `first`..`last` (inclusive) of a notice's document, the first document by default.

    A `document_id` that belongs to another notice gives no pages.
    """

    document = await _notice_document(session, notice_id, document_id)
    first = max(first, 1)
    if document is None or last < first:
        return []
    rows = await session.execute(
        select(DocumentPage.page_no, DocumentPage.section, DocumentPage.text)
        .where(DocumentPage.document_id == document.id, DocumentPage.page_no.between(first, last))
        .order_by(DocumentPage.page_no)
    )
    return [
        PageText(document.id, document.filename, page_no, document.page_count, section, text)
        for page_no, section, text in rows
    ]


@dataclass(frozen=True, slots=True)
class _DocumentPages:
    id: uuid.UUID
    filename: str
    pages: list[str]


async def _notice_document_pages(session: AsyncSession, notice_id: uuid.UUID) -> list[_DocumentPages]:
    rows = await session.execute(
        select(Document.id, Document.filename, DocumentPage.page_no, DocumentPage.text)
        .join(DocumentPage, DocumentPage.document_id == Document.id)
        .where(Document.notice_id == notice_id)
        .order_by(Document.created_at, Document.filename, Document.id, DocumentPage.page_no)
    )
    grouped: dict[uuid.UUID, tuple[str, dict[int, str]]] = {}
    for document_id, filename, page_no, text in rows:
        grouped.setdefault(document_id, (filename, {}))[1][page_no] = text
    return [
        _DocumentPages(document_id, filename, [texts.get(n, "") for n in range(1, max(texts) + 1)])
        for document_id, (filename, texts) in grouped.items()
    ]


async def find_quote(
    session: AsyncSession, notice_id: uuid.UUID, quote: str, page: int | None = None
) -> QuoteCheck:
    """Check a quote against all documents of a notice (the same rules as citation checks)."""

    best: tuple[QuoteMatch, _DocumentPages] | None = None
    for document in await _notice_document_pages(session, notice_id):
        match = match_quote(quote, PageIndex(document.pages), page)
        if best is None or match.ranks_above(best[0]):
            best = (match, document)
    if best is None:
        return QuoteCheck(check="unverified", requested_page=page)
    match, document = best
    if match.page is None or match.start is None or match.end is None:
        return QuoteCheck(check="unverified", requested_page=page)
    return QuoteCheck(
        check=match.check,
        requested_page=page,
        found_page=match.page,
        document_id=document.id,
        filename=document.filename,
        excerpt=excerpt(document.pages[match.page - 1], match.start, match.end),
        exact=match.exact,
        score=match.score,
    )


# --- LOU ------------------------------------------------------------------------------


def _section_key(number: str, suffix: str | None) -> str:
    return f"{int(number)} {suffix.lower()}" if suffix else str(int(number))


def _chapter_key(number: str, letter: str | None) -> str:
    """Chapters are stored as text: "4", or "19 a" for lettered chapters."""

    return f"{int(number)} {letter.strip().lower()}" if letter and letter.strip() else str(int(number))


def parse_lou_reference(ref: str) -> tuple[str, str] | None:
    """(chapter, section) from "4 kap. 1 §", "LOU 19 a kap. 2 §", "20:1" or "4:2a".

    The reference may be part of a longer text. Both parts are returned as stored
    ("19 a", "2 a").
    """

    match = _LOU_CHAPTER_REFERENCE.search(ref)
    if match is not None:
        return (
            _chapter_key(match["chapter"], match["letter"]),
            _section_key(match["section"], match["suffix"]),
        )
    match = _LOU_COLON_REFERENCE.match(ref)
    if match is not None:
        return _chapter_key(match["chapter"], None), _section_key(match["section"], match["suffix"])
    return None


async def get_lou_section(session: AsyncSession, chapter: str | int, section: str) -> LouSection | None:
    """One LOU section; chapter "19 a" or 4, section written "2a", "2 A" or "2 a §"."""

    chapter_match = re.fullmatch(r"\s*(\d+)\s*([a-zA-Z])?\s*(?:kap\.?)?\s*", str(chapter))
    match = _LOU_SECTION.match(section)
    if chapter_match is None or match is None:
        return None
    chapter_key = _chapter_key(chapter_match[1], chapter_match[2])
    key = _section_key(match["number"], match["suffix"])
    return await session.scalar(
        select(LouSection).where(LouSection.chapter == chapter_key, LouSection.section == key)
    )


async def search_lou(session: AsyncSession, query: str, limit: int = 5) -> list[LouSection]:
    """LOU sections for a reference ("20 kap. 1 §") or a question, most relevant first."""

    query = query.strip()
    if not query:
        return []
    reference = parse_lou_reference(query)
    if reference is not None:
        section = await get_lou_section(session, *reference)
        if section is not None:
            return [section]
    in_law_order = (LouSection.chapter, LouSection.sort_key, LouSection.id)
    for variant in _fulltext_variants(query):
        tsquery = _tsquery(variant)
        stmt = (
            select(LouSection)
            .where(LouSection.search.op("@@")(tsquery))
            .order_by(func.ts_rank_cd(LouSection.search, tsquery).desc(), *in_law_order)
            .limit(_clamp(limit))
        )
        sections = list(await session.scalars(stmt))
        if sections:
            return sections
    similarity = func.greatest(
        func.word_similarity(query, func.coalesce(LouSection.heading, "")),
        func.word_similarity(query, LouSection.text),
    )
    stmt = (
        select(LouSection)
        .where(similarity >= LOU_TEXT_SIMILARITY)
        .order_by(similarity.desc(), *in_law_order)
        .limit(_clamp(limit))
    )
    return list(await session.scalars(stmt))


# --- Published questions and answers ----------------------------------------------


async def list_published_answers(session: AsyncSession, notice_id: uuid.UUID) -> list[PublishedAnswer]:
    """The buyer's published answers for a notice, oldest answer first, as e-Avrop numbers them.

    Public data (decision 0013): the API and the MCP tools show the same rows.
    """

    rows = await session.scalars(
        select(PublishedAnswer)
        .where(PublishedAnswer.notice_id == notice_id)
        .order_by(PublishedAnswer.answered_at, PublishedAnswer.asked_at, PublishedAnswer.id)
    )
    return list(rows)


async def count_published_answers(session: AsyncSession, notice_id: uuid.UUID) -> int:
    query = select(func.count()).select_from(PublishedAnswer).where(PublishedAnswer.notice_id == notice_id)
    return int(await session.scalar(query) or 0)
