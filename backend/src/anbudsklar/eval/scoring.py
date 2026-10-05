"""Pure scoring for the quality test of tolka_underlag.

A facit lists the requirements a careful reader finds in a document, each with its page
and a verbatim fragment. An extracted requirement matches a facit item when it cites
(nearly) the same page and its quote contains (nearly) the same text, or failing that
when the titles say the same thing. Matching is one-to-one and greedy on score, so
a single broad requirement cannot claim several facit items.

Recall is the share of facit items found, precision the share of extracted requirements
that match a facit item, and the citation rate the share of all citations in the
checklist that verification found on the cited page.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, computed_field
from rapidfuzz import fuzz

from anbudsklar.api.schemas import VerificationSummary
from anbudsklar.contracts import Requirement
from anbudsklar.documents.citations import normalize

QUOTE_THRESHOLD = 80.0
"""Minimum partial ratio (0-100) between the facit fragment and the extracted quote."""

TITLE_THRESHOLD = 90.0
"""Minimum token-set ratio between titles when the quotes differ."""

PAGE_TOLERANCE = 1
"""Pages a citation may be off by: requirements often start at the foot of a page."""

_MIN_QUOTE_CHARS = 15

MatchBasis = Literal["citat", "rubrik"]


class FacitItem(BaseModel):
    """One true requirement of a fixture document (data/fixtures/**/facit.json)."""

    id: str
    kind: str
    page: int = Field(ge=1)
    quote_fragment: str = Field(min_length=3)
    title: str


@dataclass(frozen=True)
class ItemMatch:
    """A facit item and the extracted requirement it was matched to, if any."""

    facit: FacitItem
    requirement: Requirement | None = None
    score: float = 0.0
    basis: MatchBasis | None = None


class Scores(BaseModel):
    """Counts and rates for one document or for all documents together."""

    facit_total: int = 0
    extracted_total: int = 0
    matched: int = 0
    kind_matches: int = 0
    citations_total: int = 0
    citations_verified: int = 0
    citations_moved: int = 0
    citations_unverified: int = 0

    @computed_field
    @property
    def recall(self) -> float | None:
        return _rate(self.matched, self.facit_total)

    @computed_field
    @property
    def precision(self) -> float | None:
        return _rate(self.matched, self.extracted_total)

    @computed_field
    @property
    def kind_agreement(self) -> float | None:
        return _rate(self.kind_matches, self.matched)

    @computed_field
    @property
    def citation_rate(self) -> float | None:
        return _rate(self.citations_verified, self.citations_total)


def _rate(part: int, whole: int) -> float | None:
    return part / whole if whole else None


def text_score(item: FacitItem, requirement: Requirement) -> tuple[float, MatchBasis | None]:
    """How well a requirement's quote (or title) matches a facit item, and on what basis."""

    quote = normalize(requirement.citation.quote)
    quote_score = 0.0
    if len(quote) >= _MIN_QUOTE_CHARS:
        quote_score = fuzz.partial_ratio(normalize(item.quote_fragment), quote)
    if quote_score >= QUOTE_THRESHOLD:
        return quote_score, "citat"
    title_score = fuzz.token_set_ratio(normalize(item.title), normalize(requirement.title))
    if title_score >= TITLE_THRESHOLD:
        return title_score, "rubrik"
    return max(quote_score, title_score), None


def page_distance(item: FacitItem, requirement: Requirement) -> int:
    """Distance from the facit page to the cited page, or to where verification found the quote."""

    pages = [requirement.citation.page]
    if requirement.citation.found_page is not None:
        pages.append(requirement.citation.found_page)
    return min(abs(page - item.page) for page in pages)


def match_requirements(
    facit: list[FacitItem], requirements: list[Requirement], *, page_tolerance: int = PAGE_TOLERANCE
) -> list[ItemMatch]:
    """One-to-one matches, best score first; ties go to the closer page, then document order."""

    candidates: list[tuple[float, int, int, int, MatchBasis]] = []
    for facit_index, item in enumerate(facit):
        for requirement_index, requirement in enumerate(requirements):
            distance = page_distance(item, requirement)
            if distance > page_tolerance:
                continue
            score, basis = text_score(item, requirement)
            if basis is not None:
                candidates.append((score, distance, facit_index, requirement_index, basis))
    candidates.sort(key=lambda candidate: (-candidate[0], candidate[1], candidate[2], candidate[3]))

    chosen: dict[int, ItemMatch] = {}
    used: set[int] = set()
    for score, _, facit_index, requirement_index, basis in candidates:
        if facit_index in chosen or requirement_index in used:
            continue
        chosen[facit_index] = ItemMatch(facit[facit_index], requirements[requirement_index], score, basis)
        used.add(requirement_index)
    return [chosen.get(index, ItemMatch(item)) for index, item in enumerate(facit)]


def score_document(
    matches: list[ItemMatch], requirements: list[Requirement], verification: VerificationSummary
) -> Scores:
    found = [match for match in matches if match.requirement is not None]
    return Scores(
        facit_total=len(matches),
        extracted_total=len(requirements),
        matched=len(found),
        kind_matches=sum(match.requirement.kind == match.facit.kind for match in found if match.requirement),
        citations_total=verification.citations_total,
        citations_verified=verification.citations_verified,
        citations_moved=verification.citations_moved,
        citations_unverified=verification.citations_unverified,
    )


def combine(scores: list[Scores]) -> Scores:
    """Totals over several documents (micro average: every requirement counts the same)."""

    fields = Scores.model_fields
    return Scores(**{name: sum(getattr(item, name) for item in scores) for name in fields})
