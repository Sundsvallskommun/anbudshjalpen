"""Agreement catalogue CSV: validation and idempotent loading. All rows here are fictitious."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ingest.agreements import load_agreements, read_agreements_csv
from anbudsklar.ingest.common import IngestError
from anbudsklar.models import Agreement

HEADER = (
    "external_id,title,category,cpv_codes,supplier,start_date,end_date,"
    "extension_months,max_end_date,previous_requirements\n"
)
FICTITIOUS_ROWS = (
    "TEST-001,Ramavtal måleriarbeten (fiktivt),Bygg,45442100;45440000-3,Fiktiv Måleri AB,"
    "2023-12-01,2027-11-30,12;12,2029-11-30,Ansvarsförsäkring 5 mnkr\n"
    "TEST-002,Livsmedel frukt och grönt (fiktivt),Livsmedel,03220000,,,2027-09-30,,,\n"
)


def write_csv(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "agreements.csv"
    path.write_text(HEADER + body, encoding="utf-8")
    return path


def test_rows_are_parsed_and_normalised(tmp_path: Path) -> None:
    painting, food = read_agreements_csv(write_csv(tmp_path, FICTITIOUS_ROWS))

    assert painting["cpv_codes"] == ["45442100", "45440000"]  # check digit removed
    assert painting["extension_months"] == ["12", "12"]
    assert painting["start_date"] == date(2023, 12, 1)
    assert painting["max_end_date"] == date(2029, 11, 30)
    assert food["supplier"] is None and food["start_date"] is None and food["extension_months"] == []


async def test_load_agreements_upserts_on_external_id(db_session: AsyncSession, tmp_path: Path) -> None:
    assert await load_agreements(db_session, write_csv(tmp_path, FICTITIOUS_ROWS)) == 2

    changed = FICTITIOUS_ROWS.replace("2027-11-30,12;12", "2027-12-31,12")
    assert await load_agreements(db_session, write_csv(tmp_path, changed)) == 2

    agreements = (await db_session.scalars(select(Agreement).order_by(Agreement.external_id))).all()
    assert [agreement.external_id for agreement in agreements] == ["TEST-001", "TEST-002"]
    assert agreements[0].end_date == date(2027, 12, 31)
    assert agreements[0].extension_months == ["12"]
    assert agreements[0].is_fictitious is True


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ("TEST-003,,Bygg,,,,2027-01-01,,,\n", "Rad 2 i agreements.csv saknar avtals-id eller titel"),
        ("TEST-003,Avtal,Bygg,,,,,,,\n", "saknar slutdatum"),
        ("TEST-003,Avtal,Bygg,,,,31/12/2027,,,\n", "ogiltigt slutdatum: 31/12/2027"),
        ("TEST-003,Avtal,Bygg,4544,,,2027-01-01,,,\n", "ogiltiga CPV-koder: 4544"),
        ("TEST-003,Avtal,Bygg,,,,2027-01-01,ett år,,\n", "ogiltiga förlängningar"),
        ("TEST-003,Avtal,,,,,2027-01-01,,,\nTEST-003,Avtal,,,,,2027-01-01,,,\n", "TEST-003 finns redan"),
    ],
)
def test_invalid_rows_are_reported(tmp_path: Path, body: str, message: str) -> None:
    with pytest.raises(IngestError, match=message):
        read_agreements_csv(write_csv(tmp_path, body))
