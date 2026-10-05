"""CPV: the committed CSV and loading it into `cpv_codes`."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.cpv import load_cpv, read_cpv_csv
from anbudsklar.models import CpvCode

CPV_CSV = get_settings().data_dir / "cpv" / "cpv_2008_sv.csv"


def test_committed_csv_is_complete_and_consistent() -> None:
    rows = read_cpv_csv(CPV_CSV)
    by_code = {row["code"]: row for row in rows}

    assert len(rows) == len(by_code) == 9454
    divisions = [row for row in rows if row["parent_code"] is None]
    assert len(divisions) == 45
    assert all(row["level"] == 1 for row in divisions)
    assert all(row["parent_code"] in by_code for row in rows if row["parent_code"])
    assert all(by_code[row["parent_code"]]["level"] < row["level"] for row in rows if row["parent_code"])
    assert by_code["45442100"] == {
        "code": "45442100",
        "label_sv": "Målning",
        "parent_code": "45442000",
        "level": 5,
    }


async def test_load_cpv_is_idempotent_and_updates_labels(db_session: AsyncSession, tmp_path: Path) -> None:
    assert await load_cpv(db_session, CPV_CSV) == 9454
    assert await load_cpv(db_session, CPV_CSV) == 9454
    count = await db_session.scalar(select(func.count()).select_from(CpvCode))
    assert count == 9454

    renamed = tmp_path / "cpv.csv"
    renamed.write_text(
        "code,label_sv,parent_code,level\n45442100,Målning (ny benämning),45442000,5\n", encoding="utf-8"
    )
    await load_cpv(db_session, renamed)
    painting = await db_session.get(CpvCode, "45442100", populate_existing=True)
    assert painting is not None and painting.label_sv == "Målning (ny benämning)"


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("code,label_sv,parent_code\n", "saknar kolumnerna level"),
        (
            "code,label_sv,parent_code,level\n4544210,Målning,45442000,5\n",
            "Rad 2 i bad.csv är ogiltig: 4544210",
        ),
        ("code,label_sv,parent_code,level\n45442100,,45442000,5\n", "Rad 2 i bad.csv är ogiltig"),
    ],
)
def test_invalid_csv_is_reported_with_line_number(tmp_path: Path, content: str, message: str) -> None:
    path = tmp_path / "bad.csv"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(IngestError, match=message):
        read_cpv_csv(path)
