"""Key dates as day offsets from a reference date.

The fixtures are written for the reference date 2026-10-05. Every date in a document
is an offset from the reference date, so the build can be re-run for another demo day
(`--reference-date`) and the seed can shift notice deadlines to "today" with the same
offsets (see manifest.json).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from anbudsklar.contracts.tasks import DateKind

SWEDISH_MONTHS = (
    "januari",
    "februari",
    "mars",
    "april",
    "maj",
    "juni",
    "juli",
    "augusti",
    "september",
    "oktober",
    "november",
    "december",
)


@dataclass(frozen=True)
class KeyDate:
    name: str  # handle used by the content modules
    kind: DateKind  # the checklist date kind this corresponds to
    label: str  # Swedish label for the manifest
    offset_days: int


class DateBook:
    """Resolves named key dates for one document and formats them in Swedish."""

    def __init__(self, reference: date, key_dates: Sequence[KeyDate]) -> None:
        self.reference = reference
        self.key_dates = tuple(key_dates)
        self._by_name = {key_date.name: key_date for key_date in self.key_dates}
        if len(self._by_name) != len(self.key_dates):
            raise ValueError("Key date names must be unique within a document")

    def date(self, name: str) -> date:
        return self.reference + timedelta(days=self._by_name[name].offset_days)

    def iso(self, name: str) -> str:
        return self.date(name).isoformat()

    def long(self, name: str) -> str:
        """For example "9 november 2026"."""

        value = self.date(name)
        return f"{value.day} {SWEDISH_MONTHS[value.month - 1]} {value.year}"

    def day_month(self, name: str) -> str:
        """For example "12 juli"."""

        value = self.date(name)
        return f"{value.day} {SWEDISH_MONTHS[value.month - 1]}"
