"""Possible bidders (möjliga anbudsgivare): the companies that could answer a job inköp is considering.

The buyer describes a job that may become a procurement (a title and a few lines, CPV codes, or an
agreement from the catalogue that is about to be procured again) and sees which companies in
Anbudshjälpen say they do that kind of work (decision 0023). It is the market analysis before a
procurement: whether the local supplier base can answer at all, whether the job should be split
into lots, whom to invite to a leverantörsdialog.

The rules are the matching prefilter's, read in the other direction (`services.matching`): a
company is a possible bidder when it shares a CPV group with the job (three significant digits, or
a company code that covers the job's), or when at least two distinct words of its own description
occur in the job's text. No model is called and nothing is stored, so the list can be explained in
two sentences and never lags behind a profile change. Companies are few, so the words are compared
in Python rather than through the full-text index that notices have.

Equal treatment: the list says who could answer, and gives nobody information about the
procurement; that goes to everyone through e-Avrop. The buyer sees of a company only what the
matching reads: the name, the CPV codes with their labels, the municipalities, the number of
employees and the words the job shares with its description. Never the description itself, the
turnover, the insurance or the references.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import SupplierCpvKind, SupplierCpvMatch, SupplierMatch, SupplierSearch
from anbudsklar.cpv import CPV_DIGITS, MIN_GROUP_DIGITS, closest_cpv_pair, common_prefix_length
from anbudsklar.models import Company
from anbudsklar.search.queries import cpv_labels
from anbudsklar.services.cpv import normalize_cpv_codes
from anbudsklar.services.matching import MIN_KEYWORD_HITS
from anbudsklar.services.text import keywords

# A CPV category has five significant digits (as `services.upcoming.SUCCESSOR_MIN_DIGITS`).
CATEGORY_DIGITS = 5
# Two words count as the same when they share a stem: a common beginning of at least five
# letters that covers all but the last two letters of the shorter word. That takes Swedish
# plurals and definite forms ("förskola" and "förskolor", "fasad" and "fasader", "invändig" and
# "invändigt") without taking "stor" for "storstädning" or "målar" for "målning". A stemmer
# would do better; this is enough while CPV is the primary signal.
MIN_STEM_LETTERS = 5
STEM_SLACK = 2


@dataclass(frozen=True)
class _Candidate:
    company: Company
    overlap: int
    company_code: str
    words: list[str]

    @property
    def order(self) -> tuple[int, int, str]:
        """Closest CPV code first, then most shared words, then the name."""

        return (-self.overlap, -len(self.words), self.company.name)


def cpv_match_kind(overlap: int) -> SupplierCpvKind | None:
    """How close `overlap` shared significant digits are, or None below group level."""

    if overlap >= CPV_DIGITS:
        return "same_code"
    if overlap >= CATEGORY_DIGITS:
        return "same_category"
    if overlap >= MIN_GROUP_DIGITS:
        return "same_group"
    return None


def same_word(a: str, b: str) -> bool:
    """Whether two keywords are the same word in different forms (see `MIN_STEM_LETTERS`)."""

    if a == b:
        return True
    shared = common_prefix_length(a, b)
    return shared >= MIN_STEM_LETTERS and shared >= min(len(a), len(b)) - STEM_SLACK


def shared_words(company_words: Sequence[str], job_words: Iterable[str]) -> list[str]:
    """The company's words that the job's text also has, in the company's own order and form."""

    job = list(job_words)
    return [word for word in company_words if any(same_word(word, other) for other in job)]


def is_possible_bidder(overlap: int, shared: int, job_word_count: int) -> bool:
    """The prefilter rule: a CPV group in common, else enough of the company's words in the job.

    A job with a single keyword only needs that one (as `services.matching._keyword_ranks`); a
    job without words can only be matched on its codes.
    """

    if overlap >= MIN_GROUP_DIGITS:
        return True
    needed = min(MIN_KEYWORD_HITS, job_word_count)
    return needed > 0 and shared >= needed


async def find_suppliers(session: AsyncSession, search: SupplierSearch, now: datetime) -> list[SupplierMatch]:
    """The companies that could answer the job, closest first. Nothing is stored."""

    job_codes = normalize_cpv_codes(search.cpv_codes)
    job_words = keywords(f"{search.title} {search.description}")
    companies = (await session.scalars(select(Company).where(_live(now)).order_by(Company.name))).all()
    candidates: list[_Candidate] = []
    for company in companies:
        overlap, company_code, _ = closest_cpv_pair(company.cpv_codes or [], job_codes)
        words = shared_words(keywords(company.description), job_words)
        if is_possible_bidder(overlap, len(words), len(job_words)):
            candidates.append(_Candidate(company, overlap, company_code, words))
    codes = {code for candidate in candidates for code in candidate.company.cpv_codes or []}
    labels = await cpv_labels(session, codes)
    return [_view(candidate, labels) for candidate in sorted(candidates, key=lambda item: item.order)]


def _live(now: datetime) -> ColumnElement[bool]:
    """Every company, except a lab company past its retention that the purge has not reached yet."""

    return or_(Company.is_lab.is_(False), Company.expires_at > now)


def _view(candidate: _Candidate, labels: dict[str, str]) -> SupplierMatch:
    company = candidate.company
    codes = list(company.cpv_codes or [])
    kind = cpv_match_kind(candidate.overlap)
    return SupplierMatch(
        company_id=company.id,
        name=company.name,
        is_fictitious=company.is_fictitious,
        is_lab=company.is_lab,
        municipalities=list(company.municipalities or []),
        employees=company.employees,
        cpv_codes=codes,
        cpv_labels={code: labels[code] for code in codes if code in labels},
        cpv_match=(
            SupplierCpvMatch(
                company_code=candidate.company_code, label=labels.get(candidate.company_code), kind=kind
            )
            if kind
            else None
        ),
        shared_words=candidate.words,
    )
