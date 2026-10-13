"""TED: query building, mapping of a recorded search response, paging and upserts."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
import respx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.ted import (
    FIELDS,
    Deadline,
    build_query,
    fetch_ted_notices,
    ingest_ted,
    map_ted_notice,
    months_before,
    parse_deadline,
    reference_number,
)
from anbudsklar.models import Notice

from .conftest import RECORDED_AT, read_sample

CET = timezone(timedelta(hours=1))
CEST = timezone(timedelta(hours=2))


@pytest.fixture
def page() -> dict[str, Any]:
    return json.loads(read_sample("ted_search_page1.json"))


def notice(page: dict[str, Any], publication_number: str) -> dict[str, Any]:
    return next(item for item in page["notices"] if item["publication-number"] == publication_number)


# --- Query ---------------------------------------------------------------------------


def test_query_matches_buyers_by_quoted_org_number_in_both_forms_and_by_name() -> None:
    query = build_query(["Sundsvalls kommun", "Timrå kommun"], date(2025, 4, 5))

    assert '"212000-2411" "2120002411"' in query
    assert 'buyer-name ~ "Timrå kommun"' in query
    assert query.count('buyer-name ~ "Sundsvalls kommun"') == 1
    assert "notice-type IN (" in query and "can-standard" in query and "pin-only" in query
    assert query.endswith("publication-date >= 20250405 SORT BY publication-date DESC")


@pytest.mark.parametrize(
    ("day", "months", "expected"),
    [
        (date(2026, 10, 5), 18, date(2025, 4, 5)),
        (date(2026, 8, 31), 6, date(2026, 2, 28)),
        (date(2026, 1, 15), 1, date(2025, 12, 15)),
    ],
)
def test_months_before_clamps_to_the_month_length(day: date, months: int, expected: date) -> None:
    assert months_before(day, months) == expected


# --- Mapping -------------------------------------------------------------------------


def test_open_contract_notice_maps_all_fields(page: dict[str, Any]) -> None:
    record = map_ted_notice(notice(page, "684405-2026"), now=RECORDED_AT)
    values = record.values

    assert values.source == "ted"
    assert values.external_id == "684405-2026"
    assert values.title == "Maskinell och manuell snöröjning på Mitthem AB:s fastighetsmark: Delområde syd"
    assert values.buyer == "Mitthem AB"
    assert values.notice_type == "contract"
    assert values.status == "open"
    assert values.procedure == "Öppet förfarande"
    assert values.cpv_codes == ["90620000"]
    assert values.published_at == datetime(2026, 10, 5, tzinfo=CEST)
    # TED says 2026-11-02 00:00; e-Avrop shows 2026-11-01 as the last day.
    assert values.deadline_at == datetime(2026, 11, 1, 23, 59, 59, tzinfo=CET)
    assert values.estimated_value_sek == 40_000_000
    assert values.place == "Västernorrlands län"
    assert values.url == "https://ted.europa.eu/sv/notice/-/detail/684405-2026"
    assert values.documents_url == "https://www.e-avrop.com/sundsvall/e-Upphandling/NoticeLink.aspx?id=137123"
    assert values.raw["publication-number"] == "684405-2026"
    assert record.notice_identifier == values.raw["notice-identifier"]
    assert record.version == 1


def test_restricted_procedure_uses_the_request_deadline_and_unescapes_titles(page: dict[str, Any]) -> None:
    values = map_ted_notice(notice(page, "680702-2026"), now=RECORDED_AT).values

    assert values.title == "Hedbergska skolan - Fasad & tak restaurering"
    assert values.procedure == "Selektivt förfarande"
    assert values.deadline_at == datetime(2026, 10, 30, 23, 59, 59, tzinfo=CET)
    assert values.deadline_kind == "request"  # sista dag för anbudsansökan, not for tenders
    assert values.cpv_codes[0] == "45454100"  # main classification first, duplicates removed
    assert len(values.cpv_codes) == len(set(values.cpv_codes))


def test_recorded_restricted_notice_gives_only_the_request_deadline() -> None:
    """The notice on its own, recorded for this case (eForms BT-1311, no BT-131)."""

    [restricted] = json.loads(read_sample("ted_notice_restricted.json"))["notices"]

    assert restricted["procedure-type"] == "restricted"
    assert "deadline-receipt-tender-date-lot" not in restricted
    record = map_ted_notice(restricted, now=RECORDED_AT)
    assert (record.values.deadline_at, record.values.deadline_kind) == (
        datetime(2026, 10, 30, 23, 59, 59, tzinfo=CET),
        "request",
    )
    assert record.values.status == "open"


def test_open_procedure_has_a_tender_deadline(page: dict[str, Any]) -> None:
    assert map_ted_notice(notice(page, "684405-2026"), now=RECORDED_AT).values.deadline_kind == "tender"


# Synthetic field sets, so that these run without the recorded samples.
@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        (
            {
                "deadline-receipt-request-date-lot": ["2026-10-31+01:00"],
                "deadline-receipt-request-time-lot": ["00:00:00+01:00"],
            },
            Deadline(datetime(2026, 10, 30, 23, 59, 59, tzinfo=CET), "request"),
        ),
        (
            {
                "deadline-receipt-request-date-lot": ["2026-10-20+02:00"],
                "deadline-receipt-tender-date-lot": ["2026-11-03+01:00"],
            },
            Deadline(datetime(2026, 11, 3, 23, 59, 59, tzinfo=CET), "tender"),  # the tender deadline wins
        ),
        ({"deadline-receipt-tender-date-lot": []}, None),
    ],
)
def test_deadline_kind_says_which_date_it_is(fields: dict[str, Any], expected: Deadline | None) -> None:
    assert parse_deadline(fields) == expected


def test_award_notice_is_awarded_without_deadline(page: dict[str, Any]) -> None:
    values = map_ted_notice(notice(page, "672475-2026"), now=RECORDED_AT).values

    assert values.notice_type == "award"
    assert values.status == "awarded"
    assert values.deadline_at is None


def test_contract_notice_after_its_deadline_is_closed(page: dict[str, Any]) -> None:
    record = map_ted_notice(notice(page, "330645-2026"), now=RECORDED_AT)

    assert record.values.status == "closed"
    assert record.version == 2  # an eForms change notice


def test_joint_procurement_lists_every_buyer(page: dict[str, Any]) -> None:
    values = map_ted_notice(notice(page, "651454-2026"), now=RECORDED_AT).values

    assert values.buyer == "Timrå kommun, MittSverige Vatten och Avfall AB, Sundsvalls kommun"


def test_prior_information_notice_is_planned(page: dict[str, Any]) -> None:
    planned = {**notice(page, "684405-2026"), "notice-type": "pin-only"}

    values = map_ted_notice(planned, now=RECORDED_AT).values

    assert (values.notice_type, values.status) == ("planned", "planned")


def test_recorded_page_has_open_closed_and_awarded_notices(page: dict[str, Any]) -> None:
    statuses = {map_ted_notice(item, now=RECORDED_AT).values.status for item in page["notices"]}

    assert statuses == {"open", "closed", "awarded"}


def test_deadline_without_time_means_end_of_that_day() -> None:
    deadline = parse_deadline({"deadline-receipt-tender-date-lot": ["2026-11-03+01:00"]})

    assert deadline == Deadline(datetime(2026, 11, 3, 23, 59, 59, tzinfo=CET), "tender")


def test_earliest_lot_deadline_wins() -> None:
    deadline = parse_deadline(
        {
            "deadline-receipt-tender-date-lot": ["2026-11-10+01:00", "2026-11-03+01:00"],
            "deadline-receipt-tender-time-lot": ["12:00:00+01:00", "10:00:00+01:00"],
        }
    )

    assert deadline == Deadline(datetime(2026, 11, 3, 10, 0, tzinfo=CET), "tender")


def test_title_falls_back_to_notice_title_without_country_and_cpv_prefix() -> None:
    raw = {
        "publication-number": "1-2026",
        "notice-type": "cn-standard",
        "notice-title": {"swe": "Sverige – Snöröjning – Vinterväghållning 2027"},
    }

    assert map_ted_notice(raw, now=RECORDED_AT).values.title == "Vinterväghållning 2027"


def test_the_buyers_reference_is_the_procedures_internal_identifier(page: dict[str, Any]) -> None:
    assert "internal-identifier-proc" in FIELDS  # TED only returns the fields a search asks for
    with_reference = {**notice(page, "684405-2026"), "internal-identifier-proc": " KS 2026/0147 "}

    assert map_ted_notice(with_reference, now=RECORDED_AT).values.reference_number == "KS 2026/0147"
    # The recorded notices came from e-Avrop, which names no reference for the procedure.
    assert {map_ted_notice(item, now=RECORDED_AT).values.reference_number for item in page["notices"]} == {
        None
    }


@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        ({"internal-identifier-proc": ["SN-2026-12", "SN-2026-13"]}, "SN-2026-12"),
        ({"internal-identifier-proc": {"swe": "Dnr 2026/88"}}, "Dnr 2026/88"),
        # e-Avrop's own URNs are no reference people quote, at procedure or lot level.
        ({"internal-identifier-proc": "urn:eavrop:mdn:ProcurementProject:122916"}, None),
        ({"internal-identifier-lot": ["urn:eavrop:mdn:ProcurementProject:122916:Lot:1"]}, None),
        ({"internal-identifier-lot": ["Dnr 2026/88"]}, None),  # a lot's identifier is not the procedure's
        ({"internal-identifier-proc": ""}, None),
        ({}, None),
    ],
)
def test_reference_number_shapes(fields: dict[str, Any], expected: str | None) -> None:
    assert reference_number(fields) == expected


def test_values_in_other_currencies_are_not_stored_as_sek(page: dict[str, Any]) -> None:
    in_euro = {**notice(page, "684405-2026"), "estimated-value-cur-proc": "EUR"}

    assert map_ted_notice(in_euro, now=RECORDED_AT).values.estimated_value_sek is None


# --- Fetching ------------------------------------------------------------------------


async def test_fetch_follows_iteration_tokens_until_a_short_page(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings, page: dict[str, Any]
) -> None:
    # Synthetic last page: TED returns an empty page (with a token) once the results are exhausted.
    last_page = {"notices": [], "totalNoticeCount": page["totalNoticeCount"], "iterationNextToken": "next"}
    route = respx_mock.post(settings.ted_api_url).mock(
        side_effect=[httpx.Response(200, json=page), httpx.Response(200, json=last_page)]
    )

    notices = await fetch_ted_notices(client, settings, since=date(2025, 4, 5), page_size=30)

    assert len(notices) == 30
    assert route.call_count == 2
    first, second = (json.loads(call.request.content) for call in route.calls)
    assert first["paginationMode"] == "ITERATION" and first["onlyLatestVersions"] is True
    assert "iterationNextToken" not in first
    assert second["iterationNextToken"] == page["iterationNextToken"]


async def test_rejected_query_raises_with_teds_message(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    error = {"message": "Unknown search field 'buyer-cty' found in expert query"}
    respx_mock.post(settings.ted_api_url).mock(return_value=httpx.Response(400, json=error))

    with pytest.raises(IngestError, match="TED avvisade sökningen: Unknown search field"):
        await fetch_ted_notices(client, settings, since=date(2025, 4, 5))


# --- Storage -------------------------------------------------------------------------


async def count_ted(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(Notice).where(Notice.source == "ted")) or 0


async def test_ingest_inserts_then_reports_unchanged_on_rerun(
    respx_mock: respx.MockRouter,
    client: httpx.AsyncClient,
    settings: Settings,
    db_session: AsyncSession,
    page: dict[str, Any],
) -> None:
    respx_mock.post(settings.ted_api_url).mock(return_value=httpx.Response(200, json=page))

    first = await ingest_ted(db_session, client, settings, now=RECORDED_AT)
    second = await ingest_ted(db_session, client, settings, now=RECORDED_AT)

    assert first == {"fetched": 30, "inserted": 30, "updated": 0}
    assert second == {"fetched": 30, "inserted": 0, "updated": 0, "unchanged": 30}
    assert await count_ted(db_session) == 30
    stored = await db_session.scalar(select(Notice).where(Notice.external_id == "680702-2026"))
    assert stored is not None
    assert stored.title == "Hedbergska skolan - Fasad & tak restaurering"
    assert stored.raw["procedure-type"] == "restricted"
    assert stored.deadline_kind == "request"
    assert stored.is_fictitious is False


async def test_status_is_refreshed_when_the_deadline_passes(
    respx_mock: respx.MockRouter,
    client: httpx.AsyncClient,
    settings: Settings,
    db_session: AsyncSession,
    page: dict[str, Any],
) -> None:
    respx_mock.post(settings.ted_api_url).mock(return_value=httpx.Response(200, json=page))
    await ingest_ted(db_session, client, settings, now=RECORDED_AT)

    later = await ingest_ted(db_session, client, settings, now=datetime(2026, 12, 1, tzinfo=CET))

    assert later["updated"] == 9  # every open notice in the sample has closed by December
    stored = await db_session.scalar(select(Notice).where(Notice.external_id == "684405-2026"))
    assert stored is not None and stored.status == "closed"


async def test_change_notice_replaces_the_earlier_version(
    respx_mock: respx.MockRouter,
    client: httpx.AsyncClient,
    settings: Settings,
    db_session: AsyncSession,
    page: dict[str, Any],
) -> None:
    original = notice(page, "684405-2026")
    respx_mock.post(settings.ted_api_url).mock(return_value=httpx.Response(200, json=page))
    await ingest_ted(db_session, client, settings, now=RECORDED_AT)
    stored = await db_session.scalar(select(Notice).where(Notice.external_id == "684405-2026"))
    assert stored is not None

    # A change notice: new publication number and version, same notice-identifier, later deadline.
    changed = {
        **original,
        "publication-number": "690001-2026",
        "notice-version": 2,
        "deadline-receipt-tender-date-lot": ["2026-11-16+01:00"],
    }
    respx_mock.post(settings.ted_api_url).mock(
        return_value=httpx.Response(200, json={**page, "notices": [changed]})
    )
    stats = await ingest_ted(db_session, client, settings, now=RECORDED_AT)

    assert stats == {"fetched": 1, "inserted": 0, "updated": 1}
    assert await count_ted(db_session) == 30
    await db_session.refresh(stored)
    assert stored.external_id == "690001-2026"
    assert stored.deadline_at == datetime(2026, 11, 15, 23, 59, 59, tzinfo=CET)

    # The older version showing up again must not overwrite the newer one.
    respx_mock.post(settings.ted_api_url).mock(
        return_value=httpx.Response(200, json={**page, "notices": [original]})
    )
    assert (await ingest_ted(db_session, client, settings, now=RECORDED_AT))["unchanged"] == 1
    await db_session.refresh(stored)
    assert stored.external_id == "690001-2026"


def test_every_lots_description_is_kept_when_the_procedure_has_none(page: dict[str, Any]) -> None:
    """A notice with several lots describes each; only the first would lose the others."""

    raw = dict(notice(page, "684405-2026"))
    raw.pop("description-proc", None)
    raw["description-lot"] = {
        "swe": ["Delområde syd: snöröjning.", "Delområde nord: sandning.", "Delområde syd: snöröjning."]
    }
    values = map_ted_notice(raw, now=RECORDED_AT).values
    assert values.description == "Delområde syd: snöröjning.\n\nDelområde nord: sandning."
