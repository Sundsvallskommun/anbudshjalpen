"""Shared pieces for the ingestion jobs: errors, run statistics, change tracking and CSV reading."""

from __future__ import annotations

import csv
from collections.abc import Collection, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Outcome = Literal["inserted", "updated", "unchanged"]


class IngestError(RuntimeError):
    """An ingestion run failed. The message is Swedish because it is shown on the jobs page."""


@dataclass
class IngestStats:
    """Counts for one ingestion run, stored in `JobRun.stats`.

    `fetched`, `inserted` and `updated` are always reported. The other counters are only
    included when they are non-zero, so each job's stats only show what applies to it.
    """

    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    deleted: int = 0
    skipped: int = 0  # rows we parsed but could not store (see the job's log)
    blocked: int = 0  # pages not fetched because robots.txt disallows them

    def record(self, outcome: Outcome) -> None:
        setattr(self, outcome, getattr(self, outcome) + 1)

    def as_dict(self) -> dict[str, int]:
        optional = {
            "unchanged": self.unchanged,
            "deleted": self.deleted,
            "skipped": self.skipped,
            "blocked": self.blocked,
        }
        return {
            "fetched": self.fetched,
            "inserted": self.inserted,
            "updated": self.updated,
            **{key: value for key, value in optional.items() if value},
        }


def assign_changed(target: object, values: Mapping[str, object]) -> bool:
    """Set only the attributes whose value differs, and report whether anything changed.

    Comparing first keeps `updated_at` and the run statistics honest: re-ingesting an
    unchanged notice must not count as an update.
    """

    changed = False
    for name, value in values.items():
        if getattr(target, name) != value:
            setattr(target, name, value)
            changed = True
    return changed


def read_csv(path: Path, columns: Collection[str]) -> Iterator[tuple[int, dict[str, str]]]:
    """Yield (line number, stripped values) per row, after checking that all columns exist."""

    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = set(columns) - set(reader.fieldnames or [])
        if missing:
            raise IngestError(f"{path.name} saknar kolumnerna {', '.join(sorted(missing))}.")
        for record in reader:
            yield reader.line_num, {key: (record.get(key) or "").strip() for key in columns}
