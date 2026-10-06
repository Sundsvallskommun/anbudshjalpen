"""load_demo_data: idempotent upserts, dates relative to today and the calls to its collaborators."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar import seed
from anbudsklar.documents.store import store_document
from anbudsklar.models import (
    Agreement,
    ChecklistRecord,
    Company,
    CpvCode,
    Document,
    DocumentPage,
    Notice,
    User,
)

FIXTURES = Path(__file__).resolve().parents[3] / "data" / "fixtures"
MANIFEST: dict[str, Any] = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
REFERENCE = date.fromisoformat(MANIFEST["reference_date"])
STOCKHOLM = ZoneInfo("Europe/Stockholm")
PAINTING = next(
    notice for notice in MANIFEST["notices"] if notice["external_id"] == "fixture-ommalning-solbacken"
)
PERSONA_EMAILS = [persona["email"] for persona in MANIFEST["personas"]]
FIXTURE_ORG_NUMBERS = ["559900-0013", "559900-0021"]


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


@dataclass
class Calls:
    documents: list[dict[str, Any]] = field(default_factory=list)
    agreement_rows: list[dict[str, str]] = field(default_factory=list)
    cpv_paths: list[Path] = field(default_factory=list)


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> Calls:
    """Replace the document store and the two catalogue loaders with recording fakes."""

    recorded = Calls()

    async def store_document(session: AsyncSession, **kwargs: Any) -> None:
        recorded.documents.append(kwargs)

    async def load_agreements(session: AsyncSession, path: Path) -> int:
        recorded.agreement_rows = _read_csv(path)
        return len(recorded.agreement_rows)

    async def load_cpv(session: AsyncSession, path: Path) -> int:
        recorded.cpv_paths.append(path)
        return 9454

    monkeypatch.setattr(seed, "store_document", store_document)
    monkeypatch.setattr(seed, "load_agreements", load_agreements)
    monkeypatch.setattr(seed, "load_cpv", load_cpv)
    return recorded


async def _count(session: AsyncSession, statement: Any) -> int:
    return int(await session.scalar(statement) or 0)


async def test_load_demo_data_is_idempotent(db_session: AsyncSession, calls: Calls) -> None:
    first = await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)
    second = await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)

    without_cpv = {key: value for key, value in first.items() if key != "cpv_codes"}
    assert without_cpv == {
        "notices": 3,
        "documents": 3,
        "companies": 2,
        "users": 2,
        "agreements": 26,
        "replaced_documents": 0,
    }
    assert {key: value for key, value in second.items() if key != "cpv_codes"} == without_cpv
    assert await _count(db_session, select(func.count()).where(Notice.source == "fixture")) == 3
    assert (
        await _count(db_session, select(func.count()).where(Company.org_number.in_(FIXTURE_ORG_NUMBERS))) == 2
    )
    assert await _count(db_session, select(func.count()).where(User.email.in_(PERSONA_EMAILS))) == 2

    first_ids = [call["notice_id"] for call in calls.documents[:3]]
    assert [call["notice_id"] for call in calls.documents[3:]] == first_ids
    assert all(call["is_fictitious"] and call["data"].startswith(b"%PDF-") for call in calls.documents)


async def test_personas_and_companies(db_session: AsyncSession, calls: Calls) -> None:
    await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)

    users = {
        user.role: user
        for user in await db_session.scalars(select(User).where(User.email.in_(PERSONA_EMAILS)))
    }
    painter = await db_session.scalar(select(Company).where(Company.org_number == "559900-0013"))
    assert painter is not None and painter.is_fictitious
    assert painter.name == "Målerifirman i Matfors AB" and painter.employees == 5
    assert (users["foretagare"].name, users["foretagare"].company_id) == ("Anna Berg", painter.id)
    assert (users["inkopare"].name, users["inkopare"].company_id) == ("Lars Holm", None)


async def test_dates_are_relative_to_today(db_session: AsyncSession, calls: Calls) -> None:
    today = REFERENCE + timedelta(days=27)
    await seed.load_demo_data(db_session, today=today, fixtures_dir=FIXTURES)

    notice = await db_session.scalar(select(Notice).where(Notice.external_id == PAINTING["external_id"]))
    assert notice is not None and notice.is_fictitious and notice.status == "open"
    assert notice.reference_number == PAINTING["reference_number"] == "DEMO-2026-0147"
    deadline_day = today + timedelta(days=PAINTING["deadline"]["offset_days"])
    deadline_time = time.fromisoformat(PAINTING["deadline"]["time"])
    assert notice.deadline_at == datetime.combine(deadline_day, deadline_time, STOCKHOLM)
    question_stop = next(key for key in notice.raw["key_dates"] if key["kind"] == "fragestopp")
    expected_stop = next(key for key in PAINTING["key_dates"] if key["kind"] == "fragestopp")
    assert question_stop["date"] == (today + timedelta(days=expected_stop["offset_days"])).isoformat()

    original = {row["external_id"]: row for row in _read_csv(FIXTURES / "agreements.csv")}
    shifted = {row["external_id"]: row for row in calls.agreement_rows}
    painting_agreement = "DEMO-AVTAL-001"
    expected_end = date.fromisoformat(original[painting_agreement]["end_date"]) + timedelta(days=27)
    assert shifted[painting_agreement]["end_date"] == expected_end.isoformat()


async def test_cpv_codes_are_loaded_only_into_an_empty_table(db_session: AsyncSession, calls: Calls) -> None:
    await db_session.execute(delete(CpvCode))

    first = await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)
    db_session.add(CpvCode(code="45442100", label_sv="Målning", parent_code="45442000", level=5))
    await db_session.flush()
    second = await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)

    assert (first["cpv_codes"], second["cpv_codes"]) == (9454, 0)
    assert calls.cpv_paths == [seed.get_settings().data_dir / "cpv" / "cpv_2008_sv.csv"]


def test_shift_agreement_row_moves_every_date_column() -> None:
    row = {"external_id": "A", "start_date": "2026-01-31", "end_date": "2027-02-28", "max_end_date": ""}

    shifted = seed.shift_agreement_row(row, timedelta(days=1))

    assert shifted == {
        "external_id": "A",
        "start_date": "2026-02-01",
        "end_date": "2027-03-01",
        "max_end_date": "",
    }


async def test_load_demo_data_with_the_real_collaborators(db_session: AsyncSession) -> None:
    await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)
    await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)

    documents = (
        await db_session.scalars(
            select(Document).join(Notice).where(Notice.source == "fixture").order_by(Document.filename)
        )
    ).all()
    expected_pages = {
        document["filename"]: document["page_count"]
        for notice in MANIFEST["notices"]
        for document in notice["documents"]
    }
    assert {document.filename: document.page_count for document in documents} == expected_pages
    assert all(document.is_fictitious for document in documents)
    page_rows = (
        select(func.count())
        .select_from(DocumentPage)
        .where(DocumentPage.document_id.in_([document.id for document in documents]))
    )
    assert await _count(db_session, page_rows) == sum(expected_pages.values())
    agreements = select(func.count()).where(Agreement.external_id.like("DEMO-AVTAL-%"))
    assert await _count(db_session, agreements) == MANIFEST["agreements"]["rows"]
    assert await _count(db_session, select(func.count()).select_from(CpvCode)) > 9000


async def test_a_rebuilt_fixture_pdf_replaces_the_document_seeded_from_the_old_one(
    db_session: AsyncSession,
) -> None:
    await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)
    notice = await db_session.scalar(
        select(Notice).where(Notice.source == "fixture", Notice.external_id == PAINTING["external_id"])
    )
    buyer = await db_session.scalar(
        select(User).where(User.email.in_(PERSONA_EMAILS), User.role == "inkopare")
    )
    assert notice is not None and buyer is not None
    painting_pdf = PAINTING["documents"][0]
    other_pdfs = [
        document["path"]
        for other in MANIFEST["notices"]
        if other is not PAINTING
        for document in other["documents"]
    ]
    # Stand-ins for the file seeded before the generator changed and for a buyer's own upload.
    outdated = await store_document(
        db_session,
        notice_id=notice.id,
        filename=painting_pdf["filename"],
        mimetype=painting_pdf["mimetype"],
        data=(FIXTURES / other_pdfs[0]).read_bytes(),
        is_fictitious=True,
    )
    uploaded = await store_document(
        db_session,
        notice_id=notice.id,
        filename="bilaga-fran-inkop.pdf",
        mimetype="application/pdf",
        data=(FIXTURES / other_pdfs[1]).read_bytes(),
        uploaded_by=buyer.id,
        is_fictitious=True,
    )
    db_session.add(
        ChecklistRecord(
            notice_id=notice.id, document_id=outdated.id, engine="heuristic", contract_version="1", payload={}
        )
    )
    await db_session.flush()
    outdated_id = outdated.id

    counts = await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES)

    assert counts["replaced_documents"] == 1
    kept = await db_session.scalars(select(Document.sha256).where(Document.notice_id == notice.id))
    assert set(kept) == {painting_pdf["sha256"], uploaded.sha256}
    for table, column in (
        (ChecklistRecord, ChecklistRecord.document_id),
        (DocumentPage, DocumentPage.document_id),
    ):
        assert (
            await _count(db_session, select(func.count()).select_from(table).where(column == outdated_id))
            == 0
        )
    assert (await seed.load_demo_data(db_session, today=REFERENCE, fixtures_dir=FIXTURES))[
        "replaced_documents"
    ] == 0
