"""Date helpers. Deadlines are local to Sundsvall, so calendar logic uses Europe/Stockholm."""

from __future__ import annotations

import calendar
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

STOCKHOLM = ZoneInfo("Europe/Stockholm")
END_OF_DAY = time(23, 59, 59)


def utcnow() -> datetime:
    return datetime.now(UTC)


def local_date(moment: datetime) -> date:
    return moment.astimezone(STOCKHOLM).date()


def local_datetime(day: date, at: time = time(0, 0)) -> datetime:
    """A calendar date as an aware datetime at the given Stockholm wall-clock time.

    Used to schedule things relative to a deadline (reminders pick their own time of day).
    """

    return datetime.combine(day, at, tzinfo=STOCKHOLM)


def end_of_local_day(day: date) -> datetime:
    """The last second of a calendar day in Stockholm.

    A date-only deadline such as frågestopp names the last day on which something is
    allowed ("Sista dag för frågor 30 oktober"), so it has not passed until that day ends.
    """

    return datetime.combine(day, END_OF_DAY, tzinfo=STOCKHOLM)


def add_months(day: date, months: int) -> date:
    """Shift by whole months, clamping to the last day of a shorter month (31 Aug - 6 = 28/29 Feb)."""

    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))
