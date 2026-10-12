"""Notices from TED (Tenders Electronic Daily) via the anonymous Search API v3.

We ask for competition, planning and result notices published in the last 18 months by
Sundsvalls kommun and its municipal companies, and store the latest version of each
notice. Buyers are matched on organisation number (TED stores it both with and without
the hyphen) with a name fallback, because joint procurements often list another
municipality first and some notices lack the identifier. TED's reuse terms allow free
reuse of notices.

eForms change notices get a new publication number but keep their `notice-identifier`,
so a change replaces the stored row (and its external id) instead of adding a duplicate.
"""

from __future__ import annotations

import calendar
import html
import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from typing import Any, NamedTuple

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.contracts import DeadlineKind
from anbudsklar.ingest.common import IngestError, IngestStats
from anbudsklar.ingest.http import ensure_ok, send
from anbudsklar.ingest.notices import (
    STOCKHOLM,
    NoticeKind,
    NoticeStatus,
    NoticeValues,
    eavrop_procurement_id,
    save_notice,
    status_from_deadline,
    unique,
)
from anbudsklar.models import Notice

log = logging.getLogger(__name__)

SOURCE = "ted"
LOOKBACK_MONTHS = 18
PAGE_SIZE = 100  # the API allows 250, and limit x len(FIELDS) must stay under 10 000
MAX_PAGES = 50

# Sundsvalls kommun and the municipal companies that publish in TED, verified against TED
# on 2026-10-05. Korsta Oljelager, Sundsvalls Stadshus AB, Sundsvall Arena and Reko have no
# notices of their own. Midlanda Flygplats AB is co-owned with Timrå and left out.
MUNICIPAL_BUYER_IDS: dict[str, str] = {
    "212000-2411": "Sundsvalls kommun",
    "556661-8756": "MittSverige Vatten & Avfall AB",
    "556502-7223": "Sundsvall Elnät AB",
    "556478-6647": "Sundsvall Energi AB",
    "556067-6982": "Mitthem AB",
    "556015-8072": "Sundsvalls Hamn AB",
    "556437-1424": "Sundsvalls kommuns Industrifastighetsutveckling AB (SKIFU)",
    "556765-9296": "ServaNet AB",
    "556789-7383": "Sundsvall Logistikpark AB",
}
# Name fallbacks for notices that lack the organisation number.
MUNICIPAL_BUYER_NAMES: tuple[str, ...] = (
    "Sundsvalls kommun",
    "MittSverige Vatten",
    "Sundsvall Elnät",
    "Sundsvall Energi",
    "Sundsvalls Energi",
    "Mitthem",
    "Sundsvalls hamn",
    "SKIFU",
    "ServaNet",
    "Sundsvall Logistikpark",
)

# eForms notice types (codelist notice-type.gc), grouped by what they mean for a supplier.
COMPETITION_TYPES = frozenset(
    {"cn-standard", "cn-social", "cn-desg", "pin-cfc-standard", "pin-cfc-social", "qu-sy", "subco"}
)
PLANNING_TYPES = frozenset({"pin-only", "pin-buyer", "pin-rtl", "pin-tran", "pmc"})
RESULT_TYPES = frozenset({"can-standard", "can-social", "can-desg", "can-tran"})

FIELDS: tuple[str, ...] = (
    "publication-number",
    "notice-identifier",
    "notice-version",
    "procedure-identifier",
    "internal-identifier-proc",
    "notice-type",
    "form-type",
    "notice-title",
    "title-proc",
    "description-proc",
    "description-lot",
    "buyer-name",
    "buyer-identifier",
    "main-classification-proc",
    "classification-cpv",
    "publication-date",
    "deadline-receipt-tender-date-lot",
    "deadline-receipt-tender-time-lot",
    "deadline-receipt-request-date-lot",
    "deadline-receipt-request-time-lot",
    "procedure-type",
    "contract-nature",
    "estimated-value-proc",
    "estimated-value-cur-proc",
    "place-of-performance-subdiv-lot",
    "document-url-lot",
    "submission-url-lot",
    "links",
)

# Where a notice's deadline is, in order of preference: tenders (BT-131), then requests to
# participate (BT-1311).
DEADLINE_FIELDS: tuple[tuple[DeadlineKind, str, str], ...] = (
    ("tender", "deadline-receipt-tender-date-lot", "deadline-receipt-tender-time-lot"),
    ("request", "deadline-receipt-request-date-lot", "deadline-receipt-request-time-lot"),
)

PROCEDURE_LABELS: dict[str, str] = {
    "open": "Öppet förfarande",
    "restricted": "Selektivt förfarande",
    "neg-w-call": "Förhandlat förfarande med föregående annonsering",
    "neg-wo-call": "Förhandlat förfarande utan föregående annonsering",
    "comp-dial": "Konkurrenspräglad dialog",
    "innovation": "Innovationspartnerskap",
    "comp-tend": "Förnyad konkurrensutsättning",
    "oth-single": "Annat förfarande i ett steg",
    "oth-mult": "Annat förfarande i flera steg",
}

# NUTS 3 regions (Swedish counties) for place of performance.
NUTS_LABELS: dict[str, str] = {
    "SE110": "Stockholms län",
    "SE121": "Uppsala län",
    "SE122": "Södermanlands län",
    "SE123": "Östergötlands län",
    "SE124": "Örebro län",
    "SE125": "Västmanlands län",
    "SE211": "Jönköpings län",
    "SE212": "Kronobergs län",
    "SE213": "Kalmar län",
    "SE214": "Gotlands län",
    "SE221": "Blekinge län",
    "SE224": "Skåne län",
    "SE231": "Hallands län",
    "SE232": "Västra Götalands län",
    "SE311": "Värmlands län",
    "SE312": "Dalarnas län",
    "SE313": "Gävleborgs län",
    "SE321": "Västernorrlands län",
    "SE322": "Jämtlands län",
    "SE331": "Västerbottens län",
    "SE332": "Norrbottens län",
}

LANGUAGE_PREFERENCE = ("swe", "eng", "mul")


class Deadline(NamedTuple):
    """A notice's deadline and what it is the last day for."""

    at: datetime
    kind: DeadlineKind


@dataclass(frozen=True)
class TedRecord:
    """A mapped notice plus what we need to recognise later versions of it."""

    values: NoticeValues
    notice_identifier: str | None
    version: int


# --- Query ---------------------------------------------------------------------------


def months_before(day: date, months: int) -> date:
    """The same day `months` earlier, clamped to the month's length (31 Aug -> 28/29 Feb)."""

    year, month_index = divmod(day.year * 12 + day.month - 1 - months, 12)
    month = month_index + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _quoted(term: str) -> str:
    """Quote a term for TED's expert query; hyphenated org numbers must be quoted to match."""

    return '"' + term.replace('"', "") + '"'


def build_query(buyer_names: Iterable[str], since: date) -> str:
    identifiers = sorted({form for org in MUNICIPAL_BUYER_IDS for form in (org, org.replace("-", ""))})
    names = unique([*buyer_names, *MUNICIPAL_BUYER_NAMES])
    buyer_terms = [
        f"buyer-identifier IN ({' '.join(_quoted(value) for value in identifiers)})",
        *(f"buyer-name ~ {_quoted(name)}" for name in names),
    ]
    types = " ".join(sorted(COMPETITION_TYPES | PLANNING_TYPES | RESULT_TYPES))
    return (
        f"({' OR '.join(buyer_terms)}) AND notice-type IN ({types}) "
        f"AND publication-date >= {since:%Y%m%d} SORT BY publication-date DESC"
    )


async def fetch_ted_notices(
    client: httpx.AsyncClient, settings: Settings, *, since: date, page_size: int = PAGE_SIZE
) -> list[dict[str, Any]]:
    """All matching notices, paged with TED's iteration tokens (no 15 000-hit cap)."""

    body: dict[str, Any] = {
        "query": build_query(settings.ted_buyer_names, since),
        "fields": list(FIELDS),
        "limit": page_size,
        "paginationMode": "ITERATION",
        "onlyLatestVersions": True,
    }
    notices: dict[str, dict[str, Any]] = {}
    for _ in range(MAX_PAGES):
        payload = await _search_page(client, settings, body)
        page: list[dict[str, Any]] = payload.get("notices") or []
        notices.update((notice["publication-number"], notice) for notice in page)
        token = payload.get("iterationNextToken")
        if len(page) < page_size or not token:
            return list(notices.values())
        body["iterationNextToken"] = token
    log.warning("TED search stopped after %s pages; later notices were not fetched", MAX_PAGES)
    return list(notices.values())


async def _search_page(client: httpx.AsyncClient, settings: Settings, body: dict[str, Any]) -> dict[str, Any]:
    response = await send(client, "POST", settings.ted_api_url, settings=settings, json=body)
    if response.status_code == 400:
        raise IngestError(f"TED avvisade sökningen: {_error_message(response)}")
    payload: dict[str, Any] = ensure_ok(response, "TED").json()
    if payload.get("timedOut"):
        log.warning("TED reported a timed-out search; the page may be incomplete")
    return payload


def _error_message(response: httpx.Response) -> str:
    try:
        return str(response.json().get("message") or response.text)
    except ValueError:
        return response.text


# --- Mapping (pure) --------------------------------------------------------------------


def map_ted_notice(notice: Mapping[str, Any], *, now: datetime) -> TedRecord:
    """Map one TED search result to our notice columns. Pure, so it is unit tested directly."""

    publication_number = str(notice["publication-number"])
    kind = notice_kind(str(notice.get("notice-type", "")))
    deadline = parse_deadline(notice)
    deadline_at = deadline.at if deadline else None
    values = NoticeValues(
        source=SOURCE,
        external_id=publication_number,
        title=_title(notice) or f"TED-annons {publication_number}",
        notice_type=kind,
        status=_status(kind, deadline_at, now),
        raw=dict(notice),
        description=_description(notice),
        buyer=", ".join(_texts(notice.get("buyer-name"))) or None,
        reference_number=reference_number(notice),
        cpv_codes=_cpv_codes(notice),
        procedure=_procedure(notice.get("procedure-type")),
        published_at=_publication_date(notice.get("publication-date")),
        deadline_at=deadline_at,
        deadline_kind=deadline.kind if deadline else "tender",
        estimated_value_sek=_estimated_value_sek(notice),
        place=_place(notice.get("place-of-performance-subdiv-lot")),
        url=_notice_url(notice, publication_number),
        documents_url=_first(notice.get("document-url-lot")) or _first(notice.get("submission-url-lot")),
    )
    identifier = notice.get("notice-identifier")
    return TedRecord(
        values=values,
        notice_identifier=str(identifier) if identifier else None,
        version=_version(notice),
    )


def notice_kind(notice_type: str) -> NoticeKind:
    if notice_type in RESULT_TYPES:
        return "award"
    if notice_type in PLANNING_TYPES:
        return "planned"
    return "contract"


def _status(kind: NoticeKind, deadline: datetime | None, now: datetime) -> NoticeStatus:
    if kind == "award":
        return "awarded"
    if kind == "planned":
        return "planned"
    if deadline is None:
        return "closed"  # TED contract notices always carry a deadline; without one we cannot say it is open
    return status_from_deadline(deadline, now)


def parse_deadline(notice: Mapping[str, Any]) -> Deadline | None:
    """The earliest tender deadline, or else the earliest deadline for requests to participate.

    A restricted procedure's notice gives only the last day for anbudsansökan (eForms
    BT-1311, `cac:ParticipationRequestReceptionPeriod`): the tender deadline comes later, in
    the invitation to the chosen candidates. The kind says which of the two the date is.

    TED writes most deadlines as midnight at the start of the day after the last day
    (e-Avrop shows that previous day as the deadline). We store midnight as 23:59:59 on
    the last day: the same moment for all practical purposes, and the date people see
    then matches e-Avrop. A date without a time means the end of that day.
    """

    for kind, date_field, time_field in DEADLINE_FIELDS:
        dates: list[str] = list(notice.get(date_field) or [])
        times: list[str] = list(notice.get(time_field) or [])
        moments = [
            _combine(day, times[index] if index < len(times) else None) for index, day in enumerate(dates)
        ]
        if moments:
            return Deadline(min(moments), kind)
    return None


def _combine(day_text: str, time_text: str | None) -> datetime:
    day = date.fromisoformat(day_text[:10])
    day_offset = day_text[10:]
    if not time_text:
        return datetime.combine(day, time(23, 59, 59), _zone(day_offset))
    moment = datetime.fromisoformat(f"{day.isoformat()}T{time_text}")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=_zone(day_offset))
    if moment.time() == time.min:
        moment -= timedelta(seconds=1)
    return moment


def _zone(offset: str) -> tzinfo:
    """The tzinfo for an ISO offset suffix such as '+01:00' or 'Z'; Stockholm when absent."""

    parsed = datetime.fromisoformat(f"2000-01-01T00:00:00{offset}").tzinfo if offset else None
    return parsed or STOCKHOLM


def _publication_date(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value)
    return datetime.combine(date.fromisoformat(text[:10]), time.min, _zone(text[10:]))


def _texts(value: Any) -> list[str]:
    """All strings for the preferred language of a TED multilingual field ({lang: str | [str]})."""

    if not isinstance(value, Mapping) or not value:
        return []
    language = next((code for code in LANGUAGE_PREFERENCE if code in value), next(iter(value)))
    entry = value[language]
    items = entry if isinstance(entry, list) else [entry]
    return unique(html.unescape(str(item)).strip() for item in items)


def _text(value: Any) -> str | None:
    texts = _texts(value)
    return texts[0] if texts else None


def _title(notice: Mapping[str, Any]) -> str | None:
    title = _text(notice.get("title-proc"))
    if title:
        return title
    full_title = _text(notice.get("notice-title"))
    if not full_title:
        return None
    # "Sverige – <CPV label> – <title>": keep the buyer's own title.
    parts = full_title.split(" – ", 2)
    return parts[2] if len(parts) == 3 and parts[0] == "Sverige" else full_title


def _description(notice: Mapping[str, Any]) -> str | None:
    """The procedure's description, else every lot's: a notice with several lots describes each.

    Only the first lot's text would lose the others from the search, the matching and the
    notice block the engines read. Identical lot descriptions are kept once.
    """

    procedure = _text(notice.get("description-proc"))
    if procedure:
        return procedure
    lots = _texts(notice.get("description-lot"))
    return "\n\n".join(lots) or None


def reference_number(notice: Mapping[str, Any]) -> str | None:
    """The buyer's own reference for the procedure: eForms BT-22 ("internal identifier").

    Only the procedure's identifier counts. e-Avrop, which publishes Sundsvall's notices,
    leaves it empty and gives each lot a URN of its own ("urn:eavrop:mdn:…:Lot:1"); a URN is
    no reference anyone quotes, so it is not taken for one.
    """

    value = notice.get("internal-identifier-proc")
    if isinstance(value, Mapping):
        candidates = _texts(value)
    elif isinstance(value, list):
        candidates = [str(item).strip() for item in value if item]
    else:
        candidates = [str(value).strip()] if value else []
    return next((item for item in candidates if item and not item.lower().startswith("urn:")), None)


def _cpv_codes(notice: Mapping[str, Any]) -> list[str]:
    codes = [*(notice.get("main-classification-proc") or []), *(notice.get("classification-cpv") or [])]
    return unique(str(code).split("-")[0] for code in codes)


def _procedure(value: Any) -> str | None:
    if not value:
        return None
    return PROCEDURE_LABELS.get(str(value), str(value))


def _estimated_value_sek(notice: Mapping[str, Any]) -> int | None:
    value = notice.get("estimated-value-proc")
    if value in (None, "") or notice.get("estimated-value-cur-proc") != "SEK":
        return None
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return None


def _place(value: Any) -> str | None:
    regions = unique(str(code) for code in value or [])
    return ", ".join(NUTS_LABELS.get(code, code) for code in regions) or None


def _notice_url(notice: Mapping[str, Any], publication_number: str) -> str:
    links = notice.get("links") or {}
    swedish = (links.get("html") or {}).get("SWE")
    return swedish or f"https://ted.europa.eu/sv/notice/-/detail/{publication_number}"


def _first(value: Any) -> str | None:
    items = unique(str(item) for item in value or [])
    return items[0] if items else None


def _version(notice: Mapping[str, Any]) -> int:
    try:
        return int(notice.get("notice-version") or 1)
    except (TypeError, ValueError):
        return 1


# --- Storage ---------------------------------------------------------------------------


async def upsert_ted_notices(session: AsyncSession, records: Sequence[TedRecord]) -> IngestStats:
    stats = IngestStats(fetched=len(records))
    by_external_id, by_identifier = await _existing(session, records)
    from_eavrop = await _eavrop_procurement_ids(session)
    for record in records:
        existing = by_external_id.get(record.values.external_id)
        if existing is None and record.notice_identifier:
            existing = by_identifier.get(record.notice_identifier)
        if existing is None and eavrop_procurement_id(record.values.documents_url) in from_eavrop:
            stats.skipped += 1  # the same procurement is already stored from e-Avrop (decision 0009)
            continue
        if existing is not None and _version(existing.raw) > record.version:
            stats.record("unchanged")  # we already hold a newer version of this notice
            continue
        stats.record(save_notice(session, existing, record.values))
    await session.flush()
    return stats


async def _eavrop_procurement_ids(session: AsyncSession) -> set[str]:
    return set(await session.scalars(select(Notice.external_id).where(Notice.source == "eavrop")))


async def _existing(
    session: AsyncSession, records: Sequence[TedRecord]
) -> tuple[dict[str, Notice], dict[str, Notice]]:
    if not records:
        return {}, {}
    external_ids = [record.values.external_id for record in records]
    identifiers = [record.notice_identifier for record in records if record.notice_identifier]
    notice_identifier = Notice.raw.op("->>")("notice-identifier")
    result = await session.scalars(
        select(Notice).where(
            Notice.source == SOURCE,
            or_(Notice.external_id.in_(external_ids), notice_identifier.in_(identifiers)),
        )
    )
    rows = list(result)
    by_external_id = {row.external_id: row for row in rows}
    by_identifier = {
        str(row.raw["notice-identifier"]): row for row in rows if row.raw.get("notice-identifier")
    }
    return by_external_id, by_identifier


async def ingest_ted(
    session: AsyncSession, client: httpx.AsyncClient, settings: Settings, *, now: datetime | None = None
) -> dict[str, int]:
    """Fetch the last 18 months of notices for the municipal buyers and upsert them."""

    now = now or datetime.now(UTC)
    since = months_before(now.astimezone(STOCKHOLM).date(), LOOKBACK_MONTHS)
    notices = await fetch_ted_notices(client, settings, since=since)
    records = [map_ted_notice(notice, now=now) for notice in notices]
    stats = await upsert_ted_notices(session, records)
    log.info("TED ingestion: %s", stats.as_dict())
    return stats.as_dict()
