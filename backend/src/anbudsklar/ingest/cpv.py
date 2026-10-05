"""Load the CPV 2008 vocabulary with Swedish labels into `cpv_codes`.

The CSV is built from the official TED workbook by data/cpv/build_cpv_csv.py (see
data/cpv/README.md for source and licence). Loading is an idempotent upsert.
"""

from __future__ import annotations

import logging
from itertools import batched
from pathlib import Path
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ingest.common import IngestError, read_csv
from anbudsklar.models import CpvCode

log = logging.getLogger(__name__)

COLUMNS = ("code", "label_sv", "parent_code", "level")
BATCH_SIZE = 2000  # 4 parameters per row keeps each statement well under asyncpg's 32 767 limit


def read_cpv_csv(path: Path) -> list[dict[str, Any]]:
    """Validated rows from cpv_2008_sv.csv. Raises `IngestError` with the line number on bad data."""

    return [_row(record, line, path.name) for line, record in read_csv(path, COLUMNS)]


def is_cpv_code(value: str) -> bool:
    return len(value) == 8 and value.isdigit()


def _row(record: dict[str, str], line: int, filename: str) -> dict[str, Any]:
    code, label, parent, level = (record[column] for column in COLUMNS)
    if not (is_cpv_code(code) and label and (not parent or is_cpv_code(parent)) and level.isdigit()):
        raise IngestError(f"Rad {line} i {filename} är ogiltig: {code or '(ingen kod)'}.")
    return {"code": code, "label_sv": label, "parent_code": parent or None, "level": int(level)}


async def load_cpv(session: AsyncSession, path: Path) -> int:
    """Upsert every CPV code in the CSV and return how many rows were loaded."""

    rows = read_cpv_csv(path)
    for batch in batched(rows, BATCH_SIZE):
        statement = insert(CpvCode).values(list(batch))
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[CpvCode.code],
                set_={
                    "label_sv": statement.excluded.label_sv,
                    "parent_code": statement.excluded.parent_code,
                    "level": statement.excluded.level,
                },
            )
        )
    log.info("Loaded %s CPV codes from %s", len(rows), path)
    return len(rows)
