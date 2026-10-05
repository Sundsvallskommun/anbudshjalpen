"""Load the procurement department's agreement catalogue (avtalskatalog) from CSV.

The catalogue drives "kommande upphandlingar": when an agreement ends, a new procurement
usually follows. In the PoC the catalogue is fictitious (data/fixtures/agreements.csv).

Columns: external_id, title, category, cpv_codes (";"-separated), supplier, start_date,
end_date, extension_months (";"-separated, one entry per possible extension),
max_end_date, previous_requirements. Dates are ISO (YYYY-MM-DD). Loading is an idempotent
upsert on external_id.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ingest.common import IngestError, assign_changed, read_csv
from anbudsklar.ingest.cpv import is_cpv_code
from anbudsklar.models import Agreement

log = logging.getLogger(__name__)

COLUMNS = (
    "external_id",
    "title",
    "category",
    "cpv_codes",
    "supplier",
    "start_date",
    "end_date",
    "extension_months",
    "max_end_date",
    "previous_requirements",
)


def read_agreements_csv(path: Path) -> list[dict[str, Any]]:
    """Validated agreement rows. Raises `IngestError` naming the line and the problem."""

    rows: dict[str, dict[str, Any]] = {}
    for line, record in read_csv(path, COLUMNS):
        row = _row(record, f"Rad {line} i {path.name}")
        if row["external_id"] in rows:
            raise IngestError(f"Rad {line} i {path.name}: avtals-id {row['external_id']} finns redan.")
        rows[row["external_id"]] = row
    return list(rows.values())


def _row(record: dict[str, str], where: str) -> dict[str, Any]:
    if not record["external_id"] or not record["title"]:
        raise IngestError(f"{where} saknar avtals-id eller titel.")
    end_date = _date(record["end_date"], where, "slutdatum")
    if end_date is None:
        raise IngestError(f"{where} saknar slutdatum.")
    return {
        "external_id": record["external_id"],
        "title": record["title"],
        "category": record["category"] or None,
        "cpv_codes": _cpv_codes(record["cpv_codes"], where),
        "supplier": record["supplier"] or None,
        "start_date": _date(record["start_date"], where, "startdatum"),
        "end_date": end_date,
        "extension_months": _extension_months(record["extension_months"], where),
        "max_end_date": _date(record["max_end_date"], where, "senaste slutdatum"),
        "previous_requirements": record["previous_requirements"] or None,
    }


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(";") if item.strip()]


def _date(value: str, where: str, label: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise IngestError(f"{where} har ett ogiltigt {label}: {value} (skriv ÅÅÅÅ-MM-DD).") from exc


def _cpv_codes(value: str, where: str) -> list[str]:
    codes = [item.split("-")[0] for item in _split(value)]  # accept codes with check digit
    invalid = [code for code in codes if not is_cpv_code(code)]
    if invalid:
        raise IngestError(f"{where} har ogiltiga CPV-koder: {', '.join(invalid)}.")
    return list(dict.fromkeys(codes))


def _extension_months(value: str, where: str) -> list[str]:
    months = _split(value)
    if any(not item.isdigit() or int(item) == 0 for item in months):
        raise IngestError(
            f"{where} har ogiltiga förlängningar: {value} (skriv antal månader, till exempel 12;12)."
        )
    return months


async def load_agreements(session: AsyncSession, path: Path) -> int:
    """Upsert the agreements in the CSV and return how many rows were loaded."""

    rows = read_agreements_csv(path)
    result = await session.scalars(
        select(Agreement).where(Agreement.external_id.in_([row["external_id"] for row in rows]))
    )
    existing = {agreement.external_id: agreement for agreement in result}
    for row in rows:
        agreement = existing.get(row["external_id"])
        if agreement is None:
            session.add(Agreement(**row))
        else:
            assign_changed(agreement, row)
    await session.flush()
    log.info("Loaded %s agreements from %s", len(rows), path)
    return len(rows)
