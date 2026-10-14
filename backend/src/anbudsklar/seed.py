"""Demo data for the PoC: fictitious notices with documents, companies, personas and agreements.

`load_demo_data` reads `data/fixtures/manifest.json`, which `data/fixtures/build_fixtures.py`
writes together with the PDFs. It is safe to run repeatedly. Rows are upserted by their
natural keys (notice source and external id, company org number, user e-mail, agreement
external id), and `store_document` skips a file that a notice already has. A re-run resets
the fixture rows to their canonical content and moves notice and agreement dates so that
they are as far from today as they were from the manifest's reference date. Rows that
people create in the app (questions, reminders, matches, checklists) are left alone, with
one exception: when a fixture PDF has been rebuilt, the document the seed stored earlier is
replaced, and checklists interpreted from that outdated file go with it.

The PDFs themselves carry the dates of the reference date they were built for. To make a
demo day match exactly, rebuild them with `build_fixtures.py --reference-date <day>`.

The caller commits the session (the CLI uses `anbudsklar.db.session_scope()`).
"""

from __future__ import annotations

import asyncio
import csv
import datetime as dt
import hashlib
import json
import logging
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.documents.store import store_document
from anbudsklar.ingest.agreements import load_agreements
from anbudsklar.ingest.cpv import load_cpv
from anbudsklar.ingest.policies import POLICY_DIR, load_policies
from anbudsklar.models import ChecklistRecord, Company, CpvCode, Document, Notice, User

log = logging.getLogger(__name__)

STOCKHOLM = ZoneInfo("Europe/Stockholm")
FIXTURE_SOURCE = "fixture"
CPV_FILE = Path("cpv") / "cpv_2008_sv.csv"
AGREEMENT_DATE_COLUMNS = ("start_date", "end_date", "max_end_date")


# --- Manifest -----------------------------------------------------------------------


class _ManifestModel(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class Moment(_ManifestModel):
    """A point in time as days from the reference date plus a local clock time."""

    offset_days: int
    time: dt.time


class KeyDateEntry(_ManifestModel):
    kind: str
    label: str
    offset_days: int


class DocumentEntry(_ManifestModel):
    path: str
    filename: str
    mimetype: str


class NoticeEntry(_ManifestModel):
    external_id: str
    title: str
    buyer: str
    description: str
    procedure: str
    cpv_codes: list[str]
    place: str
    estimated_value_sek: int
    reference_number: str
    notice_type: str
    status: str
    published: Moment
    deadline: Moment
    key_dates: list[KeyDateEntry]
    documents: list[DocumentEntry]


class FileEntry(_ManifestModel):
    path: str


class PersonaEntry(_ManifestModel):
    role: Literal["foretagare", "inkopare"]
    name: str
    email: str
    company_org_number: str | None


class CompanyEntry(_ManifestModel):
    org_number: str
    name: str
    description: str
    cpv_codes: list[str]
    municipalities: list[str]
    employees: int | None
    annual_turnover_sek: int | None
    certifications: list[str]
    insurance: str | None
    public_references: str | None


class Manifest(_ManifestModel):
    reference_date: dt.date
    notices: list[NoticeEntry]
    agreements: FileEntry
    companies: FileEntry
    personas: list[PersonaEntry]


@dataclass(frozen=True)
class FixtureSet:
    """Everything the seed needs from disk, read in one go off the event loop."""

    directory: Path
    manifest: Manifest
    companies: list[CompanyEntry]
    files: dict[str, bytes]  # document path in the manifest -> content


def _read_fixture_set(directory: Path) -> FixtureSet:
    manifest = Manifest.model_validate_json((directory / "manifest.json").read_text(encoding="utf-8"))
    raw_companies = json.loads((directory / manifest.companies.path).read_text(encoding="utf-8"))
    companies = [CompanyEntry.model_validate(company) for company in raw_companies]
    files = {
        document.path: (directory / document.path).read_bytes()
        for notice in manifest.notices
        for document in notice.documents
    }
    return FixtureSet(directory=directory, manifest=manifest, companies=companies, files=files)


# --- Loading ------------------------------------------------------------------------


async def load_demo_data(
    session: AsyncSession, *, today: dt.date | None = None, fixtures_dir: Path | None = None
) -> dict[str, int]:
    """Load or refresh the demo data and return counts per kind of row.

    `today` anchors the dates (default: today in Europe/Stockholm); `fixtures_dir`
    defaults to `settings.data_dir / "fixtures"`.
    """

    settings = get_settings()
    fixtures = await asyncio.to_thread(_read_fixture_set, fixtures_dir or settings.data_dir / "fixtures")
    manifest = fixtures.manifest
    anchor = today or dt.datetime.now(STOCKHOLM).date()

    company_ids = await _upsert_companies(session, fixtures.companies)
    users = await _upsert_users(session, manifest.personas, company_ids)
    documents = replaced = 0
    for entry in manifest.notices:
        notice_id = await _upsert_notice(session, entry, anchor, manifest.reference_date)
        for document in entry.documents:
            await store_document(
                session,
                notice_id=notice_id,
                filename=document.filename,
                mimetype=document.mimetype,
                data=fixtures.files[document.path],
                is_fictitious=True,
            )
            documents += 1
        current = {hashlib.sha256(fixtures.files[document.path]).hexdigest() for document in entry.documents}
        replaced += await _remove_outdated_documents(session, notice_id, current)
    agreements = await _load_agreements(
        session, fixtures.directory / manifest.agreements.path, anchor - manifest.reference_date
    )
    cpv_codes = await _load_cpv_if_empty(session, settings.data_dir / CPV_FILE)
    # The steering documents are few and the repo file is their source of truth, so they
    # are refreshed on every seed (decision 0022).
    policies = await load_policies(session, settings.data_dir / POLICY_DIR)
    await session.flush()

    counts = {
        "notices": len(manifest.notices),
        "documents": documents,
        "companies": len(company_ids),
        "users": users,
        "agreements": agreements,
        "cpv_codes": cpv_codes,
        "policy_sections": policies["fetched"],
        "replaced_documents": replaced,
    }
    log.info("Loaded demo data anchored at %s: %s", anchor.isoformat(), counts)
    return counts


async def _upsert_companies(session: AsyncSession, companies: list[CompanyEntry]) -> dict[str, uuid.UUID]:
    ids: dict[str, uuid.UUID] = {}
    for company in companies:
        values = company.model_dump() | {"is_fictitious": True}
        statement = (
            insert(Company)
            .values(**values)
            .on_conflict_do_update(
                index_elements=[Company.org_number],
                set_=_updates(values, key="org_number") | {"updated_at": func.now()},
            )
            .returning(Company.id)
        )
        ids[company.org_number] = (await session.execute(statement)).scalar_one()
    return ids


async def _upsert_users(
    session: AsyncSession, personas: list[PersonaEntry], company_ids: dict[str, uuid.UUID]
) -> int:
    for persona in personas:
        values = {
            "name": persona.name,
            "email": persona.email,
            "role": persona.role,
            "company_id": company_ids[persona.company_org_number] if persona.company_org_number else None,
        }
        statement = insert(User).values(**values)
        await session.execute(
            statement.on_conflict_do_update(index_elements=[User.email], set_=_updates(values, key="email"))
        )
    return len(personas)


async def _upsert_notice(
    session: AsyncSession, entry: NoticeEntry, anchor: dt.date, reference: dt.date
) -> uuid.UUID:
    values = _notice_values(entry, anchor, reference)
    statement = (
        insert(Notice)
        .values(**values)
        .on_conflict_do_update(
            constraint="uq_notices_source_external_id",
            set_=_updates(values, key="external_id", also=("source",)) | {"updated_at": func.now()},
        )
        .returning(Notice.id)
    )
    return (await session.execute(statement)).scalar_one()


def _notice_values(entry: NoticeEntry, anchor: dt.date, reference: dt.date) -> dict[str, Any]:
    """Column values for a fixture notice with its dates moved to be relative to `anchor`."""

    return {
        "source": FIXTURE_SOURCE,
        "external_id": entry.external_id,
        "title": entry.title,
        "description": entry.description,
        "buyer": entry.buyer,
        "reference_number": entry.reference_number,
        "cpv_codes": entry.cpv_codes,
        "notice_type": entry.notice_type,
        "procedure": entry.procedure,
        "status": entry.status,
        "published_at": _local(anchor, entry.published),
        "deadline_at": _local(anchor, entry.deadline),
        "estimated_value_sek": entry.estimated_value_sek,
        "place": entry.place,
        "url": None,
        "documents_url": None,
        "is_fictitious": True,
        "raw": {
            "fixture": True,
            "built_for_reference_date": reference.isoformat(),
            "key_dates": [
                {
                    "kind": key_date.kind,
                    "label": key_date.label,
                    "date": (anchor + dt.timedelta(days=key_date.offset_days)).isoformat(),
                }
                for key_date in entry.key_dates
            ],
        },
    }


def _local(anchor: dt.date, moment: Moment) -> dt.datetime:
    return dt.datetime.combine(anchor + dt.timedelta(days=moment.offset_days), moment.time, tzinfo=STOCKHOLM)


async def _remove_outdated_documents(session: AsyncSession, notice_id: uuid.UUID, current: set[str]) -> int:
    """Delete documents the seed stored earlier for a notice whose fixture file has since changed.

    Documents are keyed by content, so a rebuilt PDF would otherwise sit beside the outdated
    one and the notice would show, search and interpret both. Only rows the seed stored are
    touched (no uploader); documents a buyer uploaded in the app stay. The database cascades
    the delete to the document's pages and checklists: they cite a file the notice no longer
    has, and the worker interprets the current file instead. The stored file stays on disk,
    because files are content-addressed and may be shared with another notice.
    """

    outdated = list(
        await session.scalars(
            select(Document.id).where(
                Document.notice_id == notice_id,
                Document.uploaded_by.is_(None),
                Document.is_fictitious.is_(True),
                Document.sha256.not_in(current),
            )
        )
    )
    if not outdated:
        return 0
    checklists = await session.scalar(
        select(func.count()).select_from(ChecklistRecord).where(ChecklistRecord.document_id.in_(outdated))
    )
    await session.execute(delete(Document).where(Document.id.in_(outdated)))
    log.warning(
        "Replaced %d outdated fixture document(s) of notice %s and removed %d checklist(s) made from them",
        len(outdated),
        notice_id,
        checklists or 0,
    )
    return len(outdated)


def _updates(values: dict[str, Any], *, key: str, also: tuple[str, ...] = ()) -> dict[str, Any]:
    """The columns an upsert overwrites: everything except the conflict key columns."""

    excluded = {key, *also}
    return {column: value for column, value in values.items() if column not in excluded}


async def _load_agreements(session: AsyncSession, source: Path, shift: dt.timedelta) -> int:
    with tempfile.TemporaryDirectory(prefix="anbudsklar-seed-") as directory:
        shifted = Path(directory) / source.name
        await asyncio.to_thread(_write_shifted_agreements, source, shifted, shift)
        return await load_agreements(session, shifted)


def _write_shifted_agreements(source: Path, target: Path, shift: dt.timedelta) -> None:
    """Copy the agreement CSV with every date column moved by `shift`."""

    with source.open(encoding="utf-8", newline="") as reader_handle:
        reader = csv.DictReader(reader_handle)
        fieldnames = list(reader.fieldnames or [])
        rows = [shift_agreement_row(row, shift) for row in reader]
    with target.open("w", encoding="utf-8", newline="") as writer_handle:
        writer = csv.DictWriter(writer_handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def shift_agreement_row(row: dict[str, str], shift: dt.timedelta) -> dict[str, str]:
    shifted = dict(row)
    for column in AGREEMENT_DATE_COLUMNS:
        if shifted.get(column):
            shifted[column] = (dt.date.fromisoformat(shifted[column]) + shift).isoformat()
    return shifted


async def _load_cpv_if_empty(session: AsyncSession, path: Path) -> int:
    """CPV codes are reference data shared with ingestion; only fill an empty table."""

    if await session.scalar(select(func.count()).select_from(CpvCode)):
        return 0
    return await load_cpv(session, path)
