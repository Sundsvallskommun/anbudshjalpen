"""Citation verification: does a quoted passage really appear on the cited page?

Every claim the coach shows must be traceable to a page, so each quote a model returns
is checked against our own extracted page text. Models copy text imperfectly and PDF
extraction is messy, so the comparison works on a matching key rather than raw text:

- Unicode compatibility forms, ligatures and diacritics are folded, and case is ignored.
- Soft hyphens and zero-width characters are dropped; typographic dashes become "-".
- Quotation marks are dropped and bullets become spaces.
- A hyphen between two word characters is removed together with any following line
  break, so "kvalifi-\\nceringskrav", "kvalificeringskrav", "IT-system" and "ITsystem" all
  compare equal.
- Whitespace is ignored when comparing, which absorbs line breaks and the missing or
  extra spaces that PDF extraction produces.

Exact matches are tried before fuzzy ones. A fuzzy match (rapidfuzz partial ratio) must
reach `FUZZY_THRESHOLD` and needs a reasonably long quote. A quote may elide text with an
ellipsis ("…", "...", "[…]"); the parts must then appear in order and close together.

Whitespace-insensitive and fuzzy comparison could let a quote change what the page says,
so every match, exact or fuzzy, is also held to guards:

- The matched passage must contain exactly the quote's numbers, month names and negations
  ("inte", "ej" …), compared as whole tokens. "0,5" and "1 500 000" are one number each,
  so "60 dagar" never verifies against "90 dagar" or "160 dagar", "5 procent" never
  against "0,5 procent", and "9 november" never against "9 december".
- The page must not negate the passage right outside it: "Alternativa anbud godtas" does
  not verify against "Alternativa anbud godtas inte".

A checklist date or evaluation weight must also be written in its quote
(`anbudsklar.documents.values`); otherwise its citation is unverified.

All functions here are pure: no database, no I/O.
"""

from __future__ import annotations

import bisect
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import cache

from rapidfuzz import fuzz

from anbudsklar.api.schemas import VerificationSummary
from anbudsklar.contracts import (
    Answer,
    Checklist,
    Citation,
    CitationCheck,
    EvaluationCriterion,
    KeyDate,
    MatchAssessment,
    RequiredAttachment,
    Requirement,
    ReviewResult,
)
from anbudsklar.documents.values import MONTH_PATTERN, MONTHS, states_date, states_percentage

FUZZY_THRESHOLD = 90.0
"""Minimum rapidfuzz partial ratio (0-100) for a fuzzy match."""

FUZZY_MIN_CHARS = 20
"""Quote parts shorter than this (whitespace removed) must match exactly."""

ELLIPSIS_MAX_GAP = 400
"""Maximum number of characters (whitespace removed) an ellipsis may stand for."""

HIGHLIGHT = "**"
"""Marks the matched passage in excerpts and search snippets (markdown bold)."""

_INVISIBLE = "\u00ad\u200b\u200c\u200d\u2060\ufeff"  # soft hyphen, zero-width characters, BOM
_QUOTES = "\"'`\u00b4\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f\u00ab\u00bb\u2039\u203a\u2032\u2033"
_DROPPED = frozenset(_INVISIBLE + _QUOTES)
_DASHES = frozenset(
    "\N{HYPHEN}\N{NON-BREAKING HYPHEN}\N{FIGURE DASH}\N{EN DASH}\N{EM DASH}\N{HORIZONTAL BAR}"
    "\N{MINUS SIGN}\N{SMALL EM DASH}\N{SMALL HYPHEN-MINUS}\N{FULLWIDTH HYPHEN-MINUS}"
)
_BULLETS = frozenset("•◦▪▫‣⁃●○■□▸►✓✔∙·")

_HYPHEN_JOIN = re.compile(r"(?<=\w)-\s*(?=\w)")
_WHITESPACE = re.compile(r"\s+")
_SPACE = re.compile(" ")
_ELLIPSIS = re.compile(r"\s*(?:[\[(]\s*(?:…|\.{3})\s*[\])]|…|\.{3,})\s*")

_NEGATIONS = "inte|ej|icke|ingen|inget|inga|aldrig"
# Applied to folded text (lower case, no diacritics, single spaces). A number keeps its
# thousands groups ("1 500 000") and decimal, date or time separators ("0,5", "5.2",
# "9.11.2026", "23:59"); "," and ":" compare like ".", so "kl. 23.59" equals "kl. 23:59".
_GUARD = re.compile(
    r"(?P<number>\d+(?: \d{3}(?!\d))*(?:(?:[.,]|:(?=\d{2}(?!\d)))\d+)*)"
    rf"|\b(?P<month>{MONTH_PATTERN})\b"
    rf"|\b(?P<negation>{_NEGATIONS})\b"
)
_LEADING_ZEROS = re.compile(r"^0+(?=\d)")
_NEGATION_BEFORE = re.compile(rf"(?<!\w)(?:{_NEGATIONS})\s*$", re.IGNORECASE)
_NEGATION_AFTER = re.compile(rf"\s*(?:{_NEGATIONS})\b", re.IGNORECASE)
_NEGATION_REACH = 16
"""Characters around a passage searched for a negation (the longest word plus spaces)."""
_CLAUSE_END = frozenset(".,;:!?)")

_CHECK_PRIORITY: dict[CitationCheck, int] = {"verified": 2, "moved": 1, "unverified": 0}


# --- Normalisation --------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Folded:
    """Normalised text plus, for every character, its index in the original text."""

    text: str
    origin: tuple[int, ...]

    def substitute(self, pattern: re.Pattern[str], replacement: str) -> _Folded:
        parts: list[str] = []
        origin: list[int] = []
        last = 0
        for match in pattern.finditer(self.text):
            parts.append(self.text[last : match.start()])
            origin.extend(self.origin[last : match.start()])
            parts.append(replacement)
            origin.extend([self.origin[match.start()]] * len(replacement))
            last = match.end()
        parts.append(self.text[last:])
        origin.extend(self.origin[last:])
        return _Folded("".join(parts), tuple(origin))


@cache
def _fold_char(char: str) -> str:
    if char in _DROPPED:
        return ""
    if char in _DASHES:
        return "-"
    if char in _BULLETS or char.isspace():
        return " "
    decomposed = unicodedata.normalize("NFKD", char)
    return "".join(part for part in decomposed if not unicodedata.combining(part)).casefold()


def _fold(text: str) -> _Folded:
    """Fold character by character so that every output character keeps its origin.

    Combining marks are dropped on their own, so a decomposed "a" + ring and a composed
    "å" both fold to "a" without a separate Unicode normalisation pass.
    """

    parts: list[str] = []
    origin: list[int] = []
    for index, char in enumerate(text):
        folded = _fold_char(char)
        parts.append(folded)
        origin.extend([index] * len(folded))
    folded_text = _Folded("".join(parts), tuple(origin))
    return folded_text.substitute(_HYPHEN_JOIN, "").substitute(_WHITESPACE, " ")


def _compact(text: str) -> _Folded:
    return _fold(text).substitute(_SPACE, "")


def normalize(text: str) -> str:
    """The matching key for `text`: folded, lower-case, dehyphenated, single-spaced.

    Not meant for display. Diacritics are folded too ("två" becomes "tva"), which keeps
    matching robust against PDFs that encode å, ä and ö as a letter plus a separate mark.
    """

    return _fold(text).text.strip()


def _guard_token(match: re.Match[str]) -> str:
    if number := match["number"]:
        return _LEADING_ZEROS.sub("", number.replace(" ", "").replace(",", ".").replace(":", "."))
    if month := match["month"]:
        return f"month:{MONTHS[month]}"
    return "negation"


def _guard_tokens(folded: str) -> Counter[str]:
    return Counter(_guard_token(match) for match in _GUARD.finditer(folded))


# --- Page index -----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _IndexedPage:
    """One page: the original text, its compact matching key and its guard tokens.

    `origin` maps every compact character to its index in `text`. Guard tokens are kept
    with their spans in `text`, sorted, so the tokens of any passage can be looked up.
    """

    text: str
    compact: str
    origin: tuple[int, ...]
    guard_starts: tuple[int, ...]
    guard_ends: tuple[int, ...]
    guard_tokens: tuple[str, ...]

    @classmethod
    def build(cls, text: str) -> _IndexedPage:
        folded = _fold(text)
        compact = folded.substitute(_SPACE, "")
        matches = list(_GUARD.finditer(folded.text))
        return cls(
            text=text,
            compact=compact.text,
            origin=compact.origin,
            guard_starts=tuple(folded.origin[match.start()] for match in matches),
            guard_ends=tuple(folded.origin[match.end() - 1] + 1 for match in matches),
            guard_tokens=tuple(_guard_token(match) for match in matches),
        )

    def tokens_between(self, start: int, end: int) -> list[str]:
        """Guard tokens overlapping `text[start:end]`, whole even where the span cuts them."""

        first = bisect.bisect_right(self.guard_ends, start)
        last = bisect.bisect_left(self.guard_starts, end)
        return list(self.guard_tokens[first:last])


class PageIndex:
    """Document pages prepared for repeated quote lookups.

    Building the index normalises every page once; verifying a whole checklist then
    costs one lookup per citation instead of one normalisation per citation and page.
    """

    def __init__(self, pages: Sequence[str]) -> None:
        self._pages: list[_IndexedPage] = [_IndexedPage.build(text) for text in pages]

    def __len__(self) -> int:
        return len(self._pages)

    def has_page(self, page_no: int | None) -> bool:
        return page_no is not None and 1 <= page_no <= len(self._pages)

    def page(self, page_no: int) -> _IndexedPage:
        return self._pages[page_no - 1]

    def pages_by_distance(self, page_no: int | None) -> list[int]:
        """All page numbers, nearest to `page_no` first (ties: the lower page)."""

        numbers = range(1, len(self._pages) + 1)
        if page_no is None:
            return list(numbers)
        return sorted(numbers, key=lambda number: (abs(number - page_no), number))

    def spill(self, page_no: int, length: int) -> str:
        """The start of the following page, so that a quote may run across a page break."""

        if page_no >= len(self._pages):
            return ""
        return self._pages[page_no].compact[:length]


# --- Matching -------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class QuoteMatch:
    """Where a quote was found.

    `page` is the 1-based page the quote starts on (None when unverified). `start` and
    `end` are character offsets of the matched passage in that page's original text.
    """

    check: CitationCheck
    page: int | None = None
    exact: bool = False
    score: float = 0.0
    start: int | None = None
    end: int | None = None

    def ranks_above(self, other: QuoteMatch) -> bool:
        mine = (_CHECK_PRIORITY[self.check], self.exact, self.score)
        theirs = (_CHECK_PRIORITY[other.check], other.exact, other.score)
        return mine > theirs


_UNVERIFIED = QuoteMatch(check="unverified")


@dataclass(frozen=True, slots=True)
class _Hit:
    page_no: int
    exact: bool
    score: float
    start: int  # offsets in the page's compact text
    end: int


@dataclass(frozen=True, slots=True)
class _Part:
    """One quote part (the quote split at ellipses): its compact key and guard tokens."""

    key: str
    guards: Counter[str]


def _quote_parts(quote: str) -> list[_Part]:
    parts: list[_Part] = []
    for raw in _ELLIPSIS.split(quote):
        folded = _fold(raw)
        key = folded.substitute(_SPACE, "").text
        if key:
            parts.append(_Part(key, _guard_tokens(folded.text)))
    return parts


def _negated_outside(text: str, start: int, end: int) -> bool:
    """Whether a negation stands right before `text[start:end]`, or right after it when
    the passage does not end a clause: then the page says the opposite of the quote.

    Punctuation in between breaks the link: "godtas, inte" and "inte. Anbud" pass.
    """

    if _NEGATION_BEFORE.search(text, max(0, start - _NEGATION_REACH), start):
        return True
    ends_clause = end > 0 and text[end - 1] in _CLAUSE_END
    return not ends_clause and _NEGATION_AFTER.match(text, end, end + _NEGATION_REACH) is not None


def _passage_holds(index: PageIndex, page_no: int, part: _Part, start: int, end: int) -> bool:
    """Whether the page passage at compact offsets `start:end` says what the quote part says.

    Its guard tokens must equal the part's, and no negation may stand right outside it.
    Offsets past the end of the page continue on the next page: an exact match may run
    across a page break (see `PageIndex.spill`).
    """

    page = index.page(page_no)
    length = len(page.compact)
    pieces: list[tuple[_IndexedPage, int, int]] = []
    if start < length:
        pieces.append((page, start, min(end, length)))
    if end > length:
        pieces.append((index.page(page_no + 1), max(start - length, 0), end - length))
    tokens: list[str] = []
    for piece, piece_start, piece_end in pieces:
        first, last = piece.origin[piece_start], piece.origin[piece_end - 1] + 1
        if _negated_outside(piece.text, first, last):
            return False
        tokens += piece.tokens_between(first, last)
    return Counter(tokens) == part.guards


def _exact_hit(index: PageIndex, page_no: int, parts: list[_Part]) -> _Hit | None:
    """The first exact occurrence on the page whose passages hold (see `_passage_holds`)."""

    page = index.page(page_no)
    gap = f".{{0,{ELLIPSIS_MAX_GAP}}}?"
    pattern = re.compile(gap.join(f"({re.escape(part.key)})" for part in parts))
    spill_length = sum(len(part.key) for part in parts) + ELLIPSIS_MAX_GAP * (len(parts) - 1)
    text = page.compact + index.spill(page_no, spill_length)
    position = 0
    while (match := pattern.search(text, position)) is not None and match.start() < len(page.compact):
        if all(
            _passage_holds(index, page_no, part, match.start(group), match.end(group))
            for group, part in enumerate(parts, start=1)
        ):
            return _Hit(page_no, True, 100.0, match.start(), min(match.end(), len(page.compact)))
        position = match.start() + 1
    return None


def _fuzzy_part(
    index: PageIndex, page_no: int, part: _Part, offset: int, limit: int
) -> tuple[float, int, int] | None:
    """Best match for one quote part in the page's `compact[offset:limit]`, as (score, start, end)."""

    text = index.page(page_no).compact
    position = offset
    while (exact := text.find(part.key, position, limit)) >= 0:
        if _passage_holds(index, page_no, part, exact, exact + len(part.key)):
            return 100.0, exact, exact + len(part.key)
        position = exact + 1
    window = text[offset:limit]
    if len(part.key) < FUZZY_MIN_CHARS or len(part.key) > len(window):
        return None
    alignment = fuzz.partial_ratio_alignment(part.key, window, score_cutoff=FUZZY_THRESHOLD)
    if alignment is None:
        return None
    start, end = offset + alignment.dest_start, offset + alignment.dest_end
    if start >= end or not _passage_holds(index, page_no, part, start, end):
        return None
    return alignment.score, start, end


def _fuzzy_hit(index: PageIndex, page_no: int, parts: list[_Part]) -> _Hit | None:
    """Fuzzy match per quote part; later parts must follow within `ELLIPSIS_MAX_GAP`."""

    length = len(index.page(page_no).compact)
    scores: list[float] = []
    starts: list[int] = []
    offset = 0
    for part in parts:
        limit = length if not starts else min(length, offset + ELLIPSIS_MAX_GAP + len(part.key))
        found = _fuzzy_part(index, page_no, part, offset, limit)
        if found is None:
            return None
        score, start, offset = found
        scores.append(score)
        starts.append(start)
    return _Hit(page_no, False, min(scores), starts[0], offset)


def _best_hit(index: PageIndex, pages: list[int], parts: list[_Part], *, exact: bool) -> _Hit | None:
    """Exact: the first page (nearest the hint) that matches. Fuzzy: the best score."""

    if exact:
        return next((hit for p in pages if (hit := _exact_hit(index, p, parts)) is not None), None)
    hits = [hit for p in pages if (hit := _fuzzy_hit(index, p, parts)) is not None]
    return max(hits, key=lambda hit: hit.score, default=None)  # max() keeps the nearest on ties


def _to_match(index: PageIndex, hit: _Hit, hint_page: int | None) -> QuoteMatch:
    page = index.page(hit.page_no)
    start = page.origin[hit.start]
    end = page.origin[hit.end - 1] + 1
    check: CitationCheck = "verified" if hint_page in (None, hit.page_no) else "moved"
    return QuoteMatch(check, hit.page_no, hit.exact, hit.score, start, end)


def match_quote(quote: str, index: PageIndex, hint_page: int | None) -> QuoteMatch:
    """Find `quote` in the indexed pages, preferring the hint page.

    Order: exact on the hint page (verified), exact elsewhere (moved, nearest page
    first), fuzzy on the hint page (verified), fuzzy elsewhere (moved, best score).
    Without a hint page, a quote found anywhere counts as verified; a hint page that
    does not exist in the document can only give moved or unverified.
    """

    parts = _quote_parts(quote)
    if not parts or len(index) == 0:
        return _UNVERIFIED
    hinted = [hint_page] if hint_page is not None and index.has_page(hint_page) else []
    others = [page_no for page_no in index.pages_by_distance(hint_page) if page_no not in hinted]
    for exact in (True, False):
        for pages in (hinted, others):
            hit = _best_hit(index, pages, parts, exact=exact)
            if hit is not None:
                return _to_match(index, hit, hint_page)
    return _UNVERIFIED


def locate_quote(quote: str, pages: Sequence[str], hint_page: int | None) -> tuple[CitationCheck, int | None]:
    """Check one quote: (verified | moved | unverified, page where it was found)."""

    match = match_quote(quote, PageIndex(pages), hint_page)
    return match.check, match.page


def _squash(value: str) -> str:
    return " ".join(value.split())


def excerpt(text: str, start: int, end: int, *, context: int = 80) -> str:
    """The passage `text[start:end]` with context on both sides, highlighted.

    The passage is widened to whole words and the context is cut at word boundaries;
    whitespace is collapsed so the excerpt reads well in a tool result or a tooltip.
    """

    start = max(0, min(start, len(text)))
    end = max(start, min(end, len(text)))
    while start > 0 and not text[start - 1].isspace():
        start -= 1
    while end < len(text) and not text[end].isspace():
        end += 1
    before = max(0, start - context)
    while 0 < before < start and not text[before - 1].isspace():
        before += 1
    after = min(len(text), end + context)
    while end < after < len(text) and not text[after].isspace():
        after -= 1
    pieces = [_squash(text[before:start]), f"{HIGHLIGHT}{_squash(text[start:end])}{HIGHLIGHT}"]
    pieces.append(_squash(text[end:after]))
    body = " ".join(piece for piece in pieces if piece)
    return f"{'… ' if before > 0 else ''}{body}{' …' if after < len(text) else ''}"


# --- Verifying contract objects -------------------------------------------------------


def _verify(citation: Citation, index: PageIndex) -> Citation:
    match = match_quote(citation.quote, index, citation.page)
    found_page = match.page if match.check == "moved" else None
    return citation.model_copy(update={"check": match.check, "found_page": found_page})


def _unverified(citation: Citation) -> Citation:
    return citation.model_copy(update={"check": "unverified", "found_page": None})


def _verify_criterion(item: EvaluationCriterion, index: PageIndex) -> EvaluationCriterion:
    """The weight shown next to the criterion must be written in its quote."""

    citation = _verify(item.citation, index)
    if item.weight_percent is not None and not states_percentage(citation.quote, item.weight_percent):
        citation = _unverified(citation)
    return item.model_copy(update={"citation": citation})


def _verify_date(item: KeyDate, index: PageIndex) -> KeyDate:
    """The date that drives deadlines and reminders must be written in its quote."""

    citation = _verify(item.citation, index)
    if item.date is not None and not states_date(citation.quote, item.date):
        citation = _unverified(citation)
    return item.model_copy(update={"citation": citation})


def _verify_optional(citation: Citation | None, index: PageIndex) -> Citation | None:
    return _verify(citation, index) if citation is not None else None


def summarize(citations: Iterable[Citation]) -> VerificationSummary:
    """Counts per verification status; citations not yet checked count as unverified."""

    counts = Counter(citation.check or "unverified" for citation in citations)
    return VerificationSummary(
        citations_total=counts.total(),
        citations_verified=counts["verified"],
        citations_moved=counts["moved"],
        citations_unverified=counts["unverified"],
    )


def checklist_citations(checklist: Checklist) -> list[Citation]:
    """Every citation in a checklist, in display order."""

    return [
        *(item.citation for item in checklist.requirements),
        *(item.citation for item in checklist.attachments),
        *(item.citation for item in checklist.evaluation),
        *(item.citation for item in checklist.dates),
        *(item.citation for item in checklist.terms if item.citation is not None),
    ]


def verify_citation(citation: Citation, pages: Sequence[str]) -> Citation:
    """A copy of `citation` with `check` and `found_page` filled in."""

    return _verify(citation, PageIndex(pages))


def verify_checklist(checklist: Checklist, pages: Sequence[str]) -> tuple[Checklist, VerificationSummary]:
    """Verify every citation in a checklist against the document it was made from.

    A date or weight that its quote does not state makes that citation unverified, so it
    is counted in the summary and the buyer is asked to check it before publishing.
    """

    index = PageIndex(pages)

    def cited[T: (Requirement, RequiredAttachment)](items: Sequence[T]) -> list[T]:
        return [item.model_copy(update={"citation": _verify(item.citation, index)}) for item in items]

    verified = checklist.model_copy(
        update={
            "requirements": cited(checklist.requirements),
            "attachments": cited(checklist.attachments),
            "evaluation": [_verify_criterion(item, index) for item in checklist.evaluation],
            "dates": [_verify_date(item, index) for item in checklist.dates],
            "terms": [
                term.model_copy(update={"citation": _verify_optional(term.citation, index)})
                for term in checklist.terms
            ],
        }
    )
    return verified, summarize(checklist_citations(verified))


def verify_answer(answer: Answer, pages: Sequence[str]) -> Answer:
    """Verify the citations of an answer to a question about the document."""

    index = PageIndex(pages)
    return answer.model_copy(update={"citations": [_verify(c, index) for c in answer.citations]})


def verify_match(assessment: MatchAssessment, pages: Sequence[str]) -> MatchAssessment:
    """Verify the citations behind a fit assessment against the notice's document."""

    index = PageIndex(pages)
    reasons = [
        reason.model_copy(update={"citation": _verify_optional(reason.citation, index)})
        for reason in assessment.reasons
    ]
    return assessment.model_copy(update={"reasons": reasons})


def verify_review(review: ReviewResult, draft_pages: Sequence[str]) -> ReviewResult:
    """Check that each quote from the tender draft really is in the draft.

    `draft_check` gets the status. `RequirementCheck` has no separate found-page field,
    so when the quote is on another page `draft_page` is corrected to where it is; the
    UI shows "på annan sida" next to the corrected page.
    """

    index = PageIndex(draft_pages)
    checks = []
    for check in review.checks:
        if not check.draft_quote:
            checks.append(check.model_copy(update={"draft_check": None}))
            continue
        match = match_quote(check.draft_quote, index, check.draft_page)
        page = match.page if match.page is not None else check.draft_page
        checks.append(check.model_copy(update={"draft_check": match.check, "draft_page": page}))
    return review.model_copy(update={"checks": checks})
