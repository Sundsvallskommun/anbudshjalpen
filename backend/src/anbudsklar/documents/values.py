"""Dates and numbers stated in a quoted passage.

A checklist date or evaluation weight is shown next to its citation, so a verified
citation must also state that value: the citation check proves that the quote is on the
page, and these helpers prove that the quote says what the structured field says. A model
that quotes "Sista anbudsdag 2026-11-09" but returns 2026-11-19, or a computed date such as
"sex dagar före sista anbudsdag", must not get a verified chip.

The parsers know the ways Swedish procurement documents write dates and numbers. A value
written in some other way is not recognised, which makes the citation unverified: the
buyer then checks it by hand, which is the safe direction.

All functions here are pure: no database, no I/O.
"""

from __future__ import annotations

import datetime as dt
import math
import re
import unicodedata

MONTHS: dict[str, int] = {
    "januari": 1,
    "jan": 1,
    "februari": 2,
    "feb": 2,
    "mars": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "maj": 5,
    "juni": 6,
    "jun": 6,
    "juli": 7,
    "jul": 7,
    "augusti": 8,
    "aug": 8,
    "september": 9,
    "sept": 9,
    "sep": 9,
    "oktober": 10,
    "okt": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}
"""Swedish month names and their usual abbreviations, lower case."""

MONTH_PATTERN = "|".join(sorted(MONTHS, key=len, reverse=True))
"""Alternation of the month names, longest first."""

_DASHES = str.maketrans(dict.fromkeys("‐‑‒–—―−", "-"))

# 2026-11-09, 2026.11.09, 2026/11/09
_YEAR_FIRST = re.compile(r"(?<!\d)(\d{4})([-./])(\d{1,2})\2(\d{1,2})(?!\d)")
# 9.11.2026, 9/11/2026, 9/11 2026, 9/11-2026
_DAY_FIRST = re.compile(r"(?<![\d.,/])(\d{1,2})([./])(\d{1,2})(?:\2|\s+|-)(\d{4})(?!\d)")
# 9/11 (no year; a slash, since "5.2" is more often a section number than a date)
_DAY_MONTH = re.compile(r"(?<![\d.,/])(\d{1,2})/(\d{1,2})(?![\d/.-])")
# 9 november 2026, 9:e nov. 2026, 1:a maj
_WRITTEN = re.compile(rf"(?<![\d.,])(\d{{1,2}})(?::?[ea])?\s+({MONTH_PATTERN})\b\.?(?:\s+(\d{{4}}))?(?!\d)")
_NUMBER = re.compile(r"(?<![\d.,])\d+(?:[.,]\d+)?(?![\d])")


def _prepare(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold().translate(_DASHES)


def _date(year: int, month: int, day: int) -> dt.date | None:
    try:
        return dt.date(year, month, day)
    except ValueError:
        return None


def stated_dates(text: str) -> tuple[set[dt.date], set[tuple[int, int]]]:
    """Dates written in `text`: full dates, and (month, day) pairs written without a year."""

    text = _prepare(text)
    full: set[dt.date] = set()
    yearless: set[tuple[int, int]] = set()
    candidates = [(int(y), int(m), int(d)) for y, _, m, d in _YEAR_FIRST.findall(text)]
    candidates += [(int(y), int(m), int(d)) for d, _, m, y in _DAY_FIRST.findall(text)]
    for day, month_name, year in _WRITTEN.findall(text):
        if year:
            candidates.append((int(year), MONTHS[month_name], int(day)))
        elif _date(2000, MONTHS[month_name], int(day)) is not None:  # 2000 is a leap year
            yearless.add((MONTHS[month_name], int(day)))
    for day, month in _DAY_MONTH.findall(text):
        if _date(2000, int(month), int(day)) is not None:
            yearless.add((int(month), int(day)))
    full.update(date for y, m, d in candidates if (date := _date(y, m, d)) is not None)
    return full, yearless


def states_date(text: str, value: dt.date) -> bool:
    """Whether `text` writes the date `value` (a date without a year matches any year)."""

    full, yearless = stated_dates(text)
    return value in full or (value.month, value.day) in yearless


def states_percentage(text: str, value: float) -> bool:
    """Whether `text` writes the percentage `value`, as "70 %" or as the fraction "0,7"."""

    for token in _NUMBER.findall(_prepare(text)):
        number = float(token.replace(",", "."))
        if math.isclose(number, value, abs_tol=0.005):
            return True
        is_fraction = number < 1 and not token.isdigit()  # "0,7", not "0"
        if is_fraction and math.isclose(number * 100, value, abs_tol=0.005):
            return True
    return False
