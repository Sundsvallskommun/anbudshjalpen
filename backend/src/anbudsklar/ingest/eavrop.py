"""Notices from e-Avrop's public pages for Sundsvall: the advertised list and the planned list.

e-Avrop has no open API, and its robots.txt currently disallows automated access to
everything except `/Places.aspx`. This job therefore reads robots.txt once per run and
fetches nothing it disallows: with today's robots.txt a run stores nothing and reports the
blocked pages. The parser and storage are ready for the day Antirio AB (the operator)
allows access, and are tested on pages saved by hand. Even then the job stays polite: an
identifiable user agent, one request per page, a pause between requests, no login, no
detail pages or document downloads, and it stops at any robot check (never bypass one).

TED covers notices above the EU thresholds; e-Avrop also lists the smaller ones.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError, IngestStats
from anbudsklar.ingest.http import ensure_ok, send, user_agent
from anbudsklar.ingest.notices import (
    NoticeValues,
    end_of_day,
    notices_by_external_id,
    save_notice,
    start_of_day,
    status_from_deadline,
    unique,
)

log = logging.getLogger(__name__)

SOURCE = "eavrop"
REQUEST_INTERVAL_SECONDS = 5.0
MAX_PLANNED_PAGES = 10
MAX_ROBOTS_REDIRECTS = 5
ROBOTS_MISSING_STATUSES = frozenset({404, 410})
GRID_ID = "mainContent_tenderGridView"

CPV_RE = re.compile(r"(\d{8})(?:-\d)?:\s*(.+?)\s*(?=\d{8}(?:-\d)?:|$)", re.S)
ID_RE = re.compile(r"[?&]id=(\d+)")
DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
PERIOD_RE = re.compile(r"Kvartal\s+([1-4])\s+(\d{4})", re.I)
PAGER_RE = re.compile(r"__doPostBack\('([^']+)','(Page\$(\d+))'\)")
INVALID_CPV = "00000000"  # e-Avrop shows "00000000: cpv utanför giltigt intervall!"


@dataclass(frozen=True)
class CpvEntry:
    code: str
    label: str


@dataclass(frozen=True)
class AdvertisedRow:
    eavrop_id: int
    title: str
    url: str
    published: date | None
    cpv: tuple[CpvEntry, ...]
    deadline: date | None
    deadline_text: str | None  # e.g. "anbud kan lämnas löpande" for continuous intake
    html: str


@dataclass(frozen=True)
class PlannedRow:
    planned_id: str
    title: str
    description: str | None
    cpv: tuple[CpvEntry, ...]
    period: str | None  # e.g. "Kvartal 3 2026"
    html: str


@dataclass(frozen=True)
class PagerTarget:
    event_target: str
    event_argument: str


@dataclass(frozen=True)
class PlannedPage:
    rows: list[PlannedRow]
    next_page: PagerTarget | None
    form_fields: dict[str, str] = field(default_factory=dict)


# --- Parsing (pure) --------------------------------------------------------------------


def parse_advertised(html: str, base_url: str) -> list[AdvertisedRow]:
    """Rows of the advertised list (`e-Upphandling/Default.aspx`)."""

    rows = (_advertised_row(tr, base_url) for tr in _data_rows(_grid(_soup(html))))
    return [row for row in rows if row is not None]


def parse_planned(html: str) -> PlannedPage:
    """Rows of one page of the planned list (`e-Upphandling/planedComing.aspx`) and its pager."""

    soup = _soup(html)
    grid = _grid(soup)
    rows = [row for row in map(_planned_row, _data_rows(grid)) if row is not None]
    return PlannedPage(rows=rows, next_page=_next_page(grid), form_fields=_postback_fields(soup))


def _advertised_row(tr: Tag, base_url: str) -> AdvertisedRow | None:
    """Columns: Rubrik (link with ?id=N), Publicerad, Område (CPV), Anbuds-/ansökningsdag."""

    cells = tr.select(":scope > td")
    link = cells[0].select_one("a[href]") if len(cells) >= 4 else None
    href = str(link.get("href", "")) if link else ""
    match = ID_RE.search(href)
    if link is None or match is None:
        return None
    deadline_cell = cells[3].get_text(" ", strip=True)
    countdown = cells[3].select_one("span.futureText, span.pastText")  # "9 dagar kvar"
    if countdown is not None:
        deadline_cell = deadline_cell.removesuffix(countdown.get_text(" ", strip=True)).strip()
    deadline = _parse_date(deadline_cell)
    return AdvertisedRow(
        eavrop_id=int(match.group(1)),
        title=link.get_text(" ", strip=True),
        url=urljoin(base_url, href),
        published=_parse_date(cells[1].get_text(" ", strip=True)),
        cpv=parse_cpv(cells[2].get_text(" ", strip=True)),
        deadline=deadline,
        deadline_text=None if deadline or not deadline_cell else deadline_cell,
        html=str(tr),
    )


def _planned_row(tr: Tag) -> PlannedRow | None:
    """Columns: Rubrik (title with a hidden description box), cpv-kod, Planerad ("Kvartal 3 2026")."""

    cells = tr.select(":scope > td")
    title_element = cells[0].select_one("span.link") if len(cells) >= 3 else None
    if title_element is None:
        return None
    title = title_element.get_text(" ", strip=True)
    description = cells[0].select_one("div.dialogueBody td")
    cpv = parse_cpv(cells[1].get_text(" ", strip=True))
    period = cells[2].get_text(" ", strip=True) or None
    return PlannedRow(
        planned_id=_planned_id(cells[0], title, period, cpv),
        title=title,
        description=description.get_text(" ", strip=True) if description else None,
        cpv=cpv,
        period=period,
        html=str(tr),
    )


def parse_cpv(text: str) -> tuple[CpvEntry, ...]:
    """CPV entries from a cell such as "90919000: Kontorsstädning90910000: Städning".

    e-Avrop separates entries with an invalid `</br>` that the HTML parser drops, so the
    next eight-digit code is what ends a label.
    """

    entries = (CpvEntry(code, label) for code, label in CPV_RE.findall(text) if code != INVALID_CPV)
    return tuple(dict.fromkeys(entries))


def parse_period(period: str | None) -> tuple[int, int] | None:
    """(year, quarter) from "Kvartal 3 2026"."""

    match = PERIOD_RE.search(period or "")
    return (int(match.group(2)), int(match.group(1))) if match else None


def _soup(html: str) -> BeautifulSoup:
    if "recaptcha" in html.lower():
        raise IngestError(
            "e-Avrop visade en robotkontroll. Insamlingen avbröts; kontrollen ska inte kringgås."
        )
    return BeautifulSoup(html, "lxml")


def _grid(soup: BeautifulSoup) -> Tag:
    grid = soup.select_one(f"table#{GRID_ID}")
    if grid is None:
        raise IngestError("e-Avrops sida saknade upphandlingstabellen. Sidans format kan ha ändrats.")
    return grid


def _data_rows(grid: Tag) -> list[Tag]:
    return grid.select("tr.rowline, tr.alternatingRow")


def _parse_date(text: str) -> date | None:
    match = DATE_RE.match(text)
    return date.fromisoformat(match.group(1)) if match else None


def _planned_id(cell: Tag, title: str, period: str | None, cpv: tuple[CpvEntry, ...]) -> str:
    """e-Avrop's id from the row's description box, else a stable hash of what the row shows."""

    dialog = cell.select_one("div.dialogue[id^='des_']")
    dialog_id = dialog.get("id") if dialog else None
    if isinstance(dialog_id, str) and dialog_id.removeprefix("des_").isdigit():
        return dialog_id.removeprefix("des_")
    fingerprint = "|".join([title, period or "", *(entry.code for entry in cpv)])
    return "h" + hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:16]


def _next_page(grid: Tag) -> PagerTarget | None:
    pager = grid.select_one("tr.GridViewPager")
    if pager is None:
        return None
    current = pager.select_one("span")
    current_text = current.get_text(strip=True) if current else ""
    current_page = int(current_text) if current_text.isdigit() else 1
    for link in pager.select("a[href]"):
        match = PAGER_RE.search(str(link.get("href", "")))
        if match and int(match.group(3)) == current_page + 1:
            return PagerTarget(event_target=match.group(1), event_argument=match.group(2))
    return None


def _postback_fields(soup: BeautifulSoup) -> dict[str, str]:
    """The fields a browser posts back for a pager click: hidden inputs and checked radios."""

    form = soup.select_one("form#form") or soup.select_one("form")
    if form is None:
        return {}
    fields: dict[str, str] = {}
    for element in form.select("input[type=hidden][name], input[type=radio][name][checked]"):
        name, value = element.get("name"), element.get("value")
        if isinstance(name, str):
            fields[name] = value if isinstance(value, str) else ""
    return fields


# --- Mapping (pure) --------------------------------------------------------------------


def map_advertised(row: AdvertisedRow, *, now: datetime) -> NoticeValues:
    deadline = end_of_day(row.deadline) if row.deadline else None
    raw = _raw(row) | {"list": "advertised"}
    return NoticeValues(
        source=SOURCE,
        external_id=str(row.eavrop_id),
        title=row.title,
        notice_type="contract",
        status=status_from_deadline(deadline, now),
        raw=raw,
        reference_number=str(row.eavrop_id),  # the procurement's id in e-Avrop, as its address shows it
        cpv_codes=unique(entry.code for entry in row.cpv),
        published_at=start_of_day(row.published) if row.published else None,
        deadline_at=deadline,
        url=row.url,
        documents_url=row.url,  # the document list is on the notice page (downloads need an account)
    )


def map_planned(row: PlannedRow, *, list_url: str) -> NoticeValues:
    """A planned procurement. It has no reference number yet: the list only names its row."""

    period = parse_period(row.period)
    raw = _raw(row) | {"list": "planned"}
    if period:
        raw |= {"planned_year": period[0], "planned_quarter": period[1]}
    return NoticeValues(
        source=SOURCE,
        external_id=f"planned-{row.planned_id}",
        title=row.title,
        notice_type="planned",
        status="planned",
        raw=raw,
        description=row.description,
        cpv_codes=unique(entry.code for entry in row.cpv),
        url=list_url,
    )


def _raw(row: AdvertisedRow | PlannedRow) -> dict[str, Any]:
    """The parsed row, including its own HTML, exactly as it reads back from JSONB.

    A JSON round trip turns tuples into lists and dates into ISO strings, so comparing a
    stored row with a freshly parsed one does not report false changes.
    """

    return json.loads(json.dumps(asdict(row), default=str))


# --- Fetching ----------------------------------------------------------------------------


@dataclass
class _Pacer:
    """Keeps at least `interval` seconds between consecutive requests to e-Avrop."""

    interval: float
    _last: float | None = None

    async def wait(self) -> None:
        if self._last is not None:
            remaining = self.interval - (time.monotonic() - self._last)
            if remaining > 0:
                await asyncio.sleep(remaining)
        self._last = time.monotonic()


def _origin(base_url: str) -> str:
    parts = urlsplit(base_url)
    return f"{parts.scheme}://{parts.netloc}"


async def _fetch_robots(client: httpx.AsyncClient, settings: Settings, url: str) -> httpx.Response:
    """GET robots.txt, following up to `MAX_ROBOTS_REDIRECTS` redirects (RFC 9309, 2.3.1.2).

    The shared client never follows redirects, so they are followed here, for robots.txt
    only and only to http(s) URLs. When the chain is longer, the last 3xx is returned.
    """

    response = await send(client, "GET", url, settings=settings)
    for _ in range(MAX_ROBOTS_REDIRECTS):
        location = response.headers.get("Location")
        if not response.is_redirect or not location:
            break
        target = urljoin(str(response.url), location)
        if urlsplit(target).scheme not in ("http", "https"):
            break
        response = await send(client, "GET", target, settings=settings)
    return response


async def load_robots(client: httpx.AsyncClient, settings: Settings, origin: str) -> RobotFileParser:
    """robots.txt as a parser.

    Only a robots.txt that is clearly absent (404 or 410) allows everything. Anything else
    that is not a successful response, including a redirect chain that does not end in a
    file and a persistent 429, disallows everything: when in doubt, fetch nothing.
    """

    response = await _fetch_robots(client, settings, f"{origin}/robots.txt")
    parser = RobotFileParser()
    if response.is_success:
        parser.parse(response.text.splitlines())
    elif response.status_code in ROBOTS_MISSING_STATUSES:
        parser.parse([])
    else:
        parser.parse(["User-agent: *", "Disallow: /"])
    return parser


async def _get_page(client: httpx.AsyncClient, settings: Settings, pacer: _Pacer, url: str) -> str:
    await pacer.wait()
    response = await send(client, "GET", url, settings=settings)
    return ensure_ok(response, "e-Avrop").text


async def _fetch_planned(
    client: httpx.AsyncClient, settings: Settings, pacer: _Pacer, url: str
) -> list[PlannedRow]:
    """All pages of the planned list. Later pages are ASP.NET postbacks of the pager link."""

    page = parse_planned(await _get_page(client, settings, pacer, url))
    rows = list(page.rows)
    pages = 1
    while page.next_page is not None and pages < MAX_PLANNED_PAGES:
        data = page.form_fields | {
            "__EVENTTARGET": page.next_page.event_target,
            "__EVENTARGUMENT": page.next_page.event_argument,
        }
        await pacer.wait()
        response = await send(client, "POST", url, settings=settings, data=data)
        page = parse_planned(ensure_ok(response, "e-Avrop").text)
        rows.extend(page.rows)
        pages += 1
    if page.next_page is not None:
        log.warning(
            "e-Avrop planned list has more than %s pages; the rest were not fetched", MAX_PLANNED_PAGES
        )
    return rows


async def ingest_eavrop(
    session: AsyncSession,
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    now: datetime | None = None,
    request_interval: float = REQUEST_INTERVAL_SECONDS,
) -> dict[str, int]:
    """Fetch the advertised and planned lists (when robots.txt allows) and upsert them.

    Pages that robots.txt disallows are counted as `blocked` instead of fetched.
    """

    now = now or datetime.now(UTC)
    base_url = settings.eavrop_base_url.rstrip("/")
    advertised_url = f"{base_url}/e-Upphandling/Default.aspx"
    planned_url = f"{base_url}/e-Upphandling/planedComing.aspx"
    agent = user_agent(settings)
    pacer = _Pacer(request_interval)
    stats = IngestStats()

    await pacer.wait()
    robots = await load_robots(client, settings, _origin(base_url))
    pacer.interval = max(request_interval, float(robots.crawl_delay(agent) or 0))

    values: list[NoticeValues] = []
    if robots.can_fetch(agent, advertised_url):
        html = await _get_page(client, settings, pacer, advertised_url)
        values += [map_advertised(row, now=now) for row in parse_advertised(html, base_url)]
    else:
        stats.blocked += 1
    if robots.can_fetch(agent, planned_url):
        rows = await _fetch_planned(client, settings, pacer, planned_url)
        values += [map_planned(row, list_url=planned_url) for row in rows]
    else:
        stats.blocked += 1
    if stats.blocked:
        log.warning("e-Avrop robots.txt disallows %s of 2 list pages; they were not fetched", stats.blocked)

    await _upsert(session, values, stats)
    log.info("e-Avrop ingestion: %s", stats.as_dict())
    return stats.as_dict()


async def _upsert(session: AsyncSession, values: Sequence[NoticeValues], stats: IngestStats) -> None:
    unique_values = list({value.external_id: value for value in values}.values())
    stats.fetched = len(unique_values)
    existing = await notices_by_external_id(session, SOURCE, (value.external_id for value in unique_values))
    for value in unique_values:
        stats.record(save_notice(session, existing.get(value.external_id), value))
    await session.flush()
