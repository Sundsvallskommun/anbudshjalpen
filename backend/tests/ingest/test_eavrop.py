"""e-Avrop: parsing of recorded list pages, robots.txt handling, paging and upserts."""

from __future__ import annotations

from datetime import date, datetime
from urllib.parse import parse_qs

import httpx
import pytest
import respx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.eavrop import (
    CpvEntry,
    PagerTarget,
    ingest_eavrop,
    load_robots,
    map_advertised,
    map_planned,
    parse_advertised,
    parse_cpv,
    parse_period,
    parse_planned,
)
from anbudsklar.ingest.notices import STOCKHOLM
from anbudsklar.models import Notice

from .conftest import RECORDED_AT, read_sample

BASE = "https://www.e-avrop.com/sundsvall"
ROBOTS_URL = "https://www.e-avrop.com/robots.txt"
ADVERTISED_URL = f"{BASE}/e-Upphandling/Default.aspx"
PLANNED_URL = f"{BASE}/e-Upphandling/planedComing.aspx"
ALLOW_ALL = "User-agent: *\nDisallow:\n"

# Synthetic: the last page of the planned list (the real pages 2-4 were never fetched,
# because robots.txt disallows it). Its pager shows page 2 as current and no page 3.
LAST_PLANNED_PAGE = """<html><body><form id="form" method="post" action="./planedComing.aspx">
<input type="hidden" name="__VIEWSTATE" value="synthetic-page-2"/>
<table id="mainContent_tenderGridView">
<tr class="headerNeutral"><th>Rubrik</th><th>cpv-kod</th><th>Planerad</th></tr>
<tr class="rowline"><td><span class="link">Fiktiv planerad upphandling</span>
<div class="dialogue" id="des_900001"><div class="dialogueBody"><table><tr><td>Syntetisk testrad.</td></tr>
</table></div></div></td><td>90910000: Städning</td><td>Kvartal 2 2027</td></tr>
<tr class="GridViewPager"><td colspan="3"><table><tr>
<td><a href="javascript:__doPostBack('ctl00$mainContent$tenderGridView','Page$1')">1</a></td>
<td><span>2</span></td></tr></table></td></tr>
</table></form></body></html>"""


# --- Parsing -------------------------------------------------------------------------


def test_advertised_list_rows() -> None:
    rows = parse_advertised(read_sample("eavrop_advertised.html"), BASE)

    assert len(rows) == 13
    first = rows[0]
    assert first.eavrop_id == 73875
    assert first.title == "Laddningsbara betalkort"
    assert first.url == "https://www.e-avrop.com/sundsvall/visa/upphandling.aspx?id=73875"
    assert first.published == date(2026, 9, 17)
    assert first.cpv == (
        CpvEntry("30163000", "Betalkort"),
        CpvEntry("66000000", "Finans- och försäkringstjänster"),
    )
    assert first.deadline == date(2026, 10, 14)
    assert first.deadline_text is None


def test_continuous_intake_has_no_deadline_and_invalid_cpv_is_dropped() -> None:
    rows = parse_advertised(read_sample("eavrop_advertised.html"), BASE)
    continuous = next(row for row in rows if row.title == "Fritt val Hemtjänst")

    assert continuous.deadline is None
    assert continuous.deadline_text == "anbud kan lämnas löpande"
    assert [entry.code for entry in continuous.cpv] == ["85310000"]


def test_planned_list_rows_pager_and_postback_fields() -> None:
    page = parse_planned(read_sample("eavrop_planned.html"))

    assert len(page.rows) == 15
    first = page.rows[0]
    assert first.planned_id == "138275"
    assert first.title == "Städtjänster"
    assert first.description == "Denna upphandling omfattar Städtjänster"
    assert [entry.code for entry in first.cpv] == ["90919000", "90910000"]
    assert first.period == "Kvartal 1 2026"
    assert page.next_page == PagerTarget("ctl00$mainContent$tenderGridView", "Page$2")
    assert page.form_fields["__VIEWSTATE"]
    assert page.form_fields["ctl00$navigationContent$NoticeLists$RadioButtonListScope"] == "coming"
    assert not any("password" in name or "username" in name for name in page.form_fields)


def test_last_planned_page_has_no_next_page() -> None:
    page = parse_planned(LAST_PLANNED_PAGE)

    assert [row.planned_id for row in page.rows] == ["900001"]
    assert page.next_page is None


def test_cpv_cell_with_check_digits_and_entities() -> None:
    assert parse_cpv("45442100-5: Målning45000000: Anläggningsarbete") == (
        CpvEntry("45442100", "Målning"),
        CpvEntry("45000000", "Anläggningsarbete"),
    )


def test_planned_period() -> None:
    assert parse_period("Kvartal 3 2026") == (2026, 3)
    assert parse_period("Hösten 2026") is None


def test_robot_check_stops_parsing() -> None:
    page = '<div id="mainContent_reCAPTCHA_RobotControl"></div>'

    with pytest.raises(IngestError, match="robotkontroll"):
        parse_advertised(page, BASE)


def test_changed_page_format_is_reported() -> None:
    with pytest.raises(IngestError, match="saknade upphandlingstabellen"):
        parse_planned("<html><body><p>Underhåll pågår</p></body></html>")


# --- Mapping -------------------------------------------------------------------------


def test_advertised_row_maps_to_an_open_contract_notice() -> None:
    row = parse_advertised(read_sample("eavrop_advertised.html"), BASE)[0]

    values = map_advertised(row, now=RECORDED_AT)

    assert values.source == "eavrop"
    assert values.external_id == "73875"
    assert values.reference_number == "73875"  # e-Avrop's id for the procurement
    assert (values.notice_type, values.status) == ("contract", "open")
    assert values.cpv_codes == ["30163000", "66000000"]
    assert values.published_at == datetime(2026, 9, 17, tzinfo=STOCKHOLM)
    assert values.deadline_at == datetime(2026, 10, 14, 23, 59, 59, tzinfo=STOCKHOLM)
    assert values.documents_url == values.url
    assert values.raw["list"] == "advertised"
    assert values.raw["deadline"] == "2026-10-14"
    assert values.raw["html"].startswith("<tr")


def test_planned_row_maps_to_a_planned_notice() -> None:
    row = parse_planned(read_sample("eavrop_planned.html")).rows[2]

    values = map_planned(row, list_url=PLANNED_URL)

    assert values.external_id == "planned-133129"
    assert values.reference_number is None  # a planned procurement has no id of its own yet
    assert values.title == "Skogsförvaltning"
    assert (values.notice_type, values.status) == ("planned", "planned")
    assert values.deadline_at is None
    assert values.raw["planned_year"] == 2026 and values.raw["planned_quarter"] == 3


# --- robots.txt and fetching ---------------------------------------------------------


async def test_robots_txt_is_respected(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings, db_session: AsyncSession
) -> None:
    robots = respx_mock.get(ROBOTS_URL).mock(
        return_value=httpx.Response(200, text=read_sample("eavrop_robots.txt"))
    )
    lists = respx_mock.route(host="www.e-avrop.com", path__startswith="/sundsvall/")

    stats = await ingest_eavrop(db_session, client, settings, now=RECORDED_AT, request_interval=0)

    assert stats == {"fetched": 0, "inserted": 0, "updated": 0, "blocked": 2}
    assert robots.call_count == 1
    assert lists.call_count == 0


@pytest.mark.parametrize(
    ("status", "allowed"),
    [(404, True), (410, True), (400, False), (401, False), (403, False), (429, False), (503, False)],
)
@pytest.mark.usefixtures("no_backoff")
async def test_missing_robots_txt_allows_and_unreachable_disallows(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings, status: int, allowed: bool
) -> None:
    respx_mock.get(ROBOTS_URL).mock(return_value=httpx.Response(status))

    robots = await load_robots(client, settings, "https://www.e-avrop.com")

    assert robots.can_fetch("Anbudsklar-PoC", ADVERTISED_URL) is allowed


async def test_robots_txt_behind_redirects_is_followed(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    respx_mock.get("http://e-avrop.com/robots.txt").mock(
        return_value=httpx.Response(301, headers={"Location": "https://e-avrop.com/robots.txt"})
    )
    respx_mock.get("https://e-avrop.com/robots.txt").mock(
        return_value=httpx.Response(302, headers={"Location": "/static/robots.txt"})
    )
    final = respx_mock.get("https://e-avrop.com/static/robots.txt").mock(
        return_value=httpx.Response(200, text=read_sample("eavrop_robots.txt"))
    )

    robots = await load_robots(client, settings, "http://e-avrop.com")

    assert final.call_count == 1
    assert (
        robots.can_fetch("Anbudsklar-PoC", "http://e-avrop.com/sundsvall/e-Upphandling/Default.aspx") is False
    )


async def test_robots_txt_with_too_many_redirects_disallows(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    loop = respx_mock.get(ROBOTS_URL).mock(return_value=httpx.Response(302, headers={"Location": ROBOTS_URL}))

    robots = await load_robots(client, settings, "https://www.e-avrop.com")

    assert loop.call_count == 6  # the first request and five redirects
    assert robots.can_fetch("Anbudsklar-PoC", ADVERTISED_URL) is False


async def test_robots_txt_redirect_to_another_scheme_disallows(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    respx_mock.get(ROBOTS_URL).mock(
        return_value=httpx.Response(302, headers={"Location": "ftp://www.e-avrop.com/robots.txt"})
    )

    robots = await load_robots(client, settings, "https://www.e-avrop.com")

    assert robots.can_fetch("Anbudsklar-PoC", ADVERTISED_URL) is False


async def test_ingest_fetches_both_lists_pages_through_planned_and_upserts(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(ROBOTS_URL).mock(return_value=httpx.Response(200, text=ALLOW_ALL))
    respx_mock.get(ADVERTISED_URL).mock(
        return_value=httpx.Response(200, text=read_sample("eavrop_advertised.html"))
    )
    respx_mock.get(PLANNED_URL).mock(
        return_value=httpx.Response(200, text=read_sample("eavrop_planned.html"))
    )
    next_page = respx_mock.post(PLANNED_URL).mock(return_value=httpx.Response(200, text=LAST_PLANNED_PAGE))

    first = await ingest_eavrop(db_session, client, settings, now=RECORDED_AT, request_interval=0)
    second = await ingest_eavrop(db_session, client, settings, now=RECORDED_AT, request_interval=0)

    assert first == {"fetched": 29, "inserted": 29, "updated": 0}
    assert second == {"fetched": 29, "inserted": 0, "updated": 0, "unchanged": 29}
    posted = parse_qs(next_page.calls[0].request.content.decode())
    assert posted["__EVENTTARGET"] == ["ctl00$mainContent$tenderGridView"]
    assert posted["__EVENTARGUMENT"] == ["Page$2"]
    assert posted["__VIEWSTATE"][0].startswith("gsgc27Q6")
    count = select(func.count()).select_from(Notice).where(Notice.source == "eavrop")
    assert await db_session.scalar(count) == 29
    planned = await db_session.scalar(select(Notice).where(Notice.external_id == "planned-900001"))
    assert planned is not None and planned.status == "planned"
