"""Dates and percentages stated in a quote (the value half of the citation check)."""

from __future__ import annotations

import datetime as dt

import pytest

from anbudsklar.documents.values import stated_dates, states_date, states_percentage

NOV_9 = dt.date(2026, 11, 9)


@pytest.mark.parametrize(
    "text",
    [
        "Sista anbudsdag 2026-11-09 kl. 23.59",
        "Sista anbudsdag 2026\N{EN DASH}11\N{EN DASH}09",
        "senast 2026.11.09",
        "senast 2026-11-9",
        "senast den 9 november 2026",
        "senast den 9:e november 2026",
        "senast den 9 nov. 2026",
        "SENAST DEN 9 NOVEMBER 2026",
        "senast 9.11.2026",
        "senast 09/11/2026",
        "senast 9/11 2026",
        "senast 9/11-2026",
        "senast den 9 november",  # no year: any year matches
        "senast 9/11",
    ],
)
def test_written_dates_are_recognised(text: str) -> None:
    assert states_date(text, NOV_9)


@pytest.mark.parametrize(
    "text",
    [
        "Sista anbudsdag 2026-11-19 kl. 23.59",
        "senast den 9 december 2026",
        "senast den 9 november 2027",
        "senast sex dagar före sista anbudsdag",
        "Avsnitt 9.11 beskriver kraven",
        "kl. 9.11",
    ],
)
def test_other_or_missing_dates_do_not_match(text: str) -> None:
    assert not states_date(text, NOV_9)


def test_impossible_dates_are_ignored() -> None:
    assert stated_dates("2026-02-30 och 31 april 2026 och 30/2") == (set(), set())


def test_a_date_without_year_keeps_month_and_day() -> None:
    assert stated_dates("den 29 februari") == (set(), {(2, 29)})


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("5.2 Pris, 70 %", 70),
        ("Pris viktas till 70 procent", 70.0),
        ("Kvalitet 12,5 %", 12.5),
        ("Pris viktas 0,7 och kvalitet 0,3", 30),
        ("pris 60 % och kvalitet 40 %", 40),
    ],
)
def test_percentages_are_recognised(text: str, value: float) -> None:
    assert states_percentage(text, value)


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("5.2 Pris, 70 %", 30),
        ("Pris viktas till sjuttio procent", 70),
        ("5.1 Pris", 100),  # "1" is not the fraction 1.0
        ("Kvalitet 12,5 %", 12),
    ],
)
def test_other_or_missing_percentages_do_not_match(text: str, value: float) -> None:
    assert not states_percentage(text, value)
