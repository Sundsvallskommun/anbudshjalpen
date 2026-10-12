"""Mapping target and storage helpers shared by the TED and e-Avrop notice jobs."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field, fields
from datetime import date, datetime, time
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.contracts import DeadlineKind
from anbudsklar.ingest.common import Outcome, assign_changed
from anbudsklar.models import Notice

STOCKHOLM = ZoneInfo("Europe/Stockholm")

NoticeStatus = Literal["open", "closed", "awarded", "planned"]
NoticeKind = Literal["contract", "award", "planned"]


@dataclass(frozen=True)
class NoticeValues:
    """The columns an ingestion job sets on a `Notice` (everything except ids and timestamps)."""

    source: str
    external_id: str
    title: str
    notice_type: NoticeKind
    status: NoticeStatus
    raw: dict[str, Any]
    description: str | None = None
    buyer: str | None = None
    reference_number: str | None = None
    cpv_codes: list[str] = field(default_factory=list)
    procedure: str | None = None
    published_at: datetime | None = None
    deadline_at: datetime | None = None
    deadline_kind: DeadlineKind = "tender"
    # The source's last day for questions, as the end of that day; None when it gives none.
    question_deadline_at: datetime | None = None
    estimated_value_sek: int | None = None
    place: str | None = None
    url: str | None = None
    documents_url: str | None = None

    def columns(self) -> dict[str, Any]:
        return {item.name: getattr(self, item.name) for item in fields(self)} | {"is_fictitious": False}


_EAVROP_NOTICE_LINK = re.compile(r"e-avrop\.com/.*[?&]id=(\d+)", re.IGNORECASE)


def eavrop_procurement_id(url: str | None) -> str | None:
    """e-Avrop's procurement id in a notice link (`NoticeLink.aspx?id=121907`), if it is one.

    TED's document link for a notice that e-Avrop sent there is this link, so the id ties a
    TED notice to the same procurement in e-Avrop's API (`ProcurementId`).
    """

    match = _EAVROP_NOTICE_LINK.search(url or "")
    return match.group(1) if match else None


def status_from_deadline(deadline: datetime | None, now: datetime) -> NoticeStatus:
    """A contract notice is open until its deadline; without a deadline it accepts tenders continuously."""

    return "open" if deadline is None or deadline >= now else "closed"


def start_of_day(day: date) -> datetime:
    return datetime.combine(day, time.min, STOCKHOLM)


def end_of_day(day: date) -> datetime:
    """The last second of a Swedish calendar day, used when a source only gives a date."""

    return datetime.combine(day, time(23, 59, 59), STOCKHOLM)


def unique(values: Iterable[str]) -> list[str]:
    """Drop empty values and duplicates, keeping the first occurrence's position."""

    return list(dict.fromkeys(value for value in values if value))


async def notices_by_external_id(
    session: AsyncSession, source: str, external_ids: Iterable[str]
) -> dict[str, Notice]:
    ids = list(external_ids)
    if not ids:
        return {}
    result = await session.scalars(select(Notice).where(Notice.source == source, Notice.external_id.in_(ids)))
    return {notice.external_id: notice for notice in result}


def save_notice(session: AsyncSession, existing: Notice | None, values: NoticeValues) -> Outcome:
    """Insert a new notice or update the changed columns of an existing one (flush is the caller's)."""

    if existing is None:
        session.add(Notice(**values.columns()))
        return "inserted"
    return "updated" if assign_changed(existing, values.columns()) else "unchanged"
