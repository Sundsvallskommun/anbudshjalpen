"""Upcoming procurements, predicted from the agreement catalogue (avtalskatalog).

Rule (date arithmetic only, no AI): a new procurement is usually announced 9 to 6
months before the current agreement ends, which leaves time for the tender period,
evaluation, the standstill period (avtalsspärr) and a possible review. The window is
counted from `end_date`, because the catalogue does not say whether an extension option
will be used; `max_end_date` is shown next to it so the reader sees how far an
extension could push it. The rule fits procurements below the EU thresholds, which
are most of what small companies bid on; above-threshold procurements often start
earlier.

An agreement whose successor is already advertised is no longer upcoming and is left
out. A successor is an open notice with the same title, or one that shares both a CPV
code at category level and a word of the title with the agreement: the code alone
would take a single painting job for the successor of a painting framework agreement.
One whose window has passed without such a notice is kept and marked
`announcement_overdue`: it should already have been announced, so the reader should
look among the notices.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import UpcomingProcurement
from anbudsklar.cpv import common_prefix_length, shares_cpv_group, significant_digits
from anbudsklar.models import Agreement, Notice
from anbudsklar.services.dates import add_months, local_datetime
from anbudsklar.services.text import keywords
from anbudsklar.visibility import shown_agreements, shown_notices

ANNOUNCE_MONTHS_BEFORE_END = (9, 6)
SUCCESSOR_MIN_DIGITS = 5  # CPV category level
STEM_LETTERS = 6  # "förskola" and "förskolor" share a word


def announcement_window(end_date: date) -> tuple[date, date]:
    """Earliest and latest likely announcement date for a successor procurement."""

    earliest, latest = ANNOUNCE_MONTHS_BEFORE_END
    return add_months(end_date, -earliest), add_months(end_date, -latest)


async def list_upcoming(
    session: AsyncSession, *, months: int, today: date, company_codes: list[str] | None
) -> list[UpcomingProcurement]:
    """Running agreements whose successor is likely to be announced within `months`."""

    horizon = add_months(today, months)
    agreements = await session.scalars(
        select(Agreement).where(Agreement.end_date >= today, shown_agreements())
    )
    open_notices = await _open_notices(session, today)
    items: list[UpcomingProcurement] = []
    for agreement in agreements:
        expected_from, expected_to = announcement_window(agreement.end_date)
        if expected_from > horizon or _has_successor(agreement, open_notices):
            continue
        items.append(
            UpcomingProcurement(
                agreement_id=agreement.id,
                title=agreement.title,
                category=agreement.category,
                cpv_codes=list(agreement.cpv_codes or []),
                end_date=agreement.end_date,
                max_end_date=agreement.max_end_date,
                expected_from=expected_from,
                expected_to=expected_to,
                previous_requirements=agreement.previous_requirements,
                is_fictitious=agreement.is_fictitious,
                relevant_for_company=shares_cpv_group(company_codes or [], agreement.cpv_codes or []),
                announcement_overdue=expected_to < today,
            )
        )
    return sorted(items, key=lambda item: (item.expected_from, item.title))


@dataclass(frozen=True)
class _OpenNotice:
    title: str
    stems: frozenset[str]
    codes: tuple[str, ...]  # significant digits


async def _open_notices(session: AsyncSession, today: date) -> list[_OpenNotice]:
    """The notices that are open for tenders today."""

    rows = await session.execute(
        select(Notice.title, Notice.cpv_codes).where(
            shown_notices(),
            Notice.status == "open",
            or_(Notice.deadline_at.is_(None), Notice.deadline_at >= local_datetime(today)),
        )
    )
    return [
        _OpenNotice(_normalised(title), _stems(title), _significant(codes or [])) for title, codes in rows
    ]


def _has_successor(agreement: Agreement, notices: Sequence[_OpenNotice]) -> bool:
    title, stems = _normalised(agreement.title), _stems(agreement.title)
    codes = _significant(agreement.cpv_codes or [])
    for notice in notices:
        if notice.title == title:
            return True
        same_work = any(_same_category(a, b) for a in codes for b in notice.codes)
        if same_work and stems & notice.stems:
            return True
    return False


def _significant(codes: Sequence[str]) -> tuple[str, ...]:
    return tuple(digits for code in codes if (digits := significant_digits(code)))


def _stems(title: str) -> frozenset[str]:
    return frozenset(word[:STEM_LETTERS] for word in keywords(title))


def _same_category(a: str, b: str) -> bool:
    """Broad codes (a division or a group) say too little to name a successor."""

    return common_prefix_length(a, b) >= SUCCESSOR_MIN_DIGITS


def _normalised(title: str) -> str:
    return " ".join(title.casefold().replace("(fiktivt)", "").replace("(fiktiv)", "").split())
