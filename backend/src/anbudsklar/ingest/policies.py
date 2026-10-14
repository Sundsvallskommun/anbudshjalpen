"""The municipality's steering documents for purchasing (styrdokument), from data/styrdokument/*.md.

Decision 0022: a source class of its own next to LOU. Each file is one document: a front
matter with the facts about it, then one "## <number> <heading> (s. N)" heading per
section with the text as the document has it (data/styrdokument/README.md says what the
transcription changes). The repo is the source of truth rather than a crawl, because the
municipality decides these documents rarely and by formal decision, so a revision is a
reviewed pull request, and because the PDF's text layer splits words, which exact quotes
would not survive. Loading is an idempotent mirror: sections and documents that left the
files leave the database.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ingest.common import IngestError, IngestStats, assign_changed
from anbudsklar.models import PolicyDocument, PolicySection

log = logging.getLogger(__name__)

POLICY_DIR = "styrdokument"
REQUIRED_KEYS = ("slug", "title", "short_title", "source_url")
DATE_KEYS = ("decided_on", "retrieved_on")
TEXT_KEYS = ("decided_by", "diarienummer", "validity")
FRONT_MATTER_EDGE = "---"
HEADING_RE = re.compile(
    r"^## (?P<number>\d+(?:\.\d+)*) (?P<heading>\S.*?) \(s\. (?P<start>\d+)(?:[–-](?P<end>\d+))?\)\s*$"
)
KEY_VALUE_RE = re.compile(r"^(?P<key>[a-z_]+):\s*(?P<value>.*)$")
SLUG_RE = re.compile(r"^[a-z0-9-]+$")


@dataclass(frozen=True)
class PolicySectionRow:
    """One section as read from a file."""

    number: str  # "5.2"
    heading: str
    text: str  # paragraphs separated by blank lines; list items on their own lines
    page_start: int
    page_end: int
    sort_key: int  # position in the document, 1-based


@dataclass(frozen=True)
class PolicyFile:
    """One steering document as read from a file."""

    slug: str
    title: str
    short_title: str
    source_url: str
    decided_by: str | None
    decided_on: date | None
    diarienummer: str | None
    validity: str | None
    retrieved_on: date | None
    sections: tuple[PolicySectionRow, ...]


# --- Parsing (pure) --------------------------------------------------------------------


def parse_policy_file(text: str, filename: str) -> PolicyFile:
    """Read one document file. Raises `IngestError` naming the file and line on bad input."""

    lines = text.replace("\r\n", "\n").split("\n")
    facts, body_start = _front_matter(lines, filename)
    sections = tuple(_sections(lines, body_start, filename))
    if not sections:
        raise IngestError(f"{filename} har inga avsnitt (rader som börjar med '## ').")
    slug = facts["slug"]
    if not SLUG_RE.match(slug) or slug != Path(filename).stem:
        raise IngestError(
            f"{filename}: slug måste vara filnamnet utan .md, med små bokstäver, siffror och bindestreck."
        )
    return PolicyFile(
        slug=slug,
        title=facts["title"],
        short_title=facts["short_title"],
        source_url=facts["source_url"],
        decided_by=facts.get("decided_by"),
        decided_on=_date(facts, "decided_on", filename),
        diarienummer=facts.get("diarienummer"),
        validity=facts.get("validity"),
        retrieved_on=_date(facts, "retrieved_on", filename),
        sections=sections,
    )


def read_policy_files(directory: Path) -> list[PolicyFile]:
    """Every `*.md` document in the folder except its README, in file-name order."""

    if not directory.is_dir():
        raise IngestError(f"Mappen med styrdokument finns inte: {directory}")
    files = sorted(path for path in directory.glob("*.md") if path.name.lower() != "readme.md")
    return [parse_policy_file(path.read_text(encoding="utf-8"), path.name) for path in files]


def _front_matter(lines: Sequence[str], filename: str) -> tuple[dict[str, str], int]:
    """The key: value block between the two `---` lines, and the index of the first body line."""

    if not lines or lines[0].strip() != FRONT_MATTER_EDGE:
        raise IngestError(f"{filename} måste börja med en rad '---' följd av uppgifterna om dokumentet.")
    facts: dict[str, str] = {}
    for index in range(1, len(lines)):
        line = lines[index]
        if line.strip() == FRONT_MATTER_EDGE:
            missing = [key for key in REQUIRED_KEYS if not facts.get(key)]
            if missing:
                raise IngestError(f"{filename} saknar uppgifterna {', '.join(missing)}.")
            return facts, index + 1
        if not line.strip():
            continue
        match = KEY_VALUE_RE.match(line)
        if match is None:
            raise IngestError(f"Rad {index + 1} i {filename} är inte 'nyckel: värde'.")
        facts[match["key"]] = match["value"].strip()
    raise IngestError(f"{filename}: uppgifterna om dokumentet avslutas inte med en rad '---'.")


def _date(facts: dict[str, str], key: str, filename: str) -> date | None:
    value = facts.get(key)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise IngestError(f"{filename}: {key} måste vara ett datum i formen ÅÅÅÅ-MM-DD.") from error


def _sections(lines: Sequence[str], start: int, filename: str) -> Iterator[PolicySectionRow]:
    """Sections in file order; consecutive text lines form a block and blank lines separate blocks."""

    current: dict[str, object] | None = None
    blocks: list[list[str]] = []
    seen: set[str] = set()
    position = 0

    def finish() -> Iterator[PolicySectionRow]:
        if current is None:
            return
        text = "\n\n".join("\n".join(block) for block in blocks if block)
        if not text:
            raise IngestError(f"{filename}: avsnitt {current['number']} har ingen text.")
        yield PolicySectionRow(
            number=str(current["number"]),
            heading=str(current["heading"]),
            text=text,
            page_start=int(str(current["start"])),
            page_end=int(str(current["end"])),
            sort_key=int(str(current["position"])),
        )

    for offset, line in enumerate(lines[start:], start=start + 1):
        if line.startswith("## "):
            yield from finish()
            match = HEADING_RE.match(line)
            if match is None:
                raise IngestError(
                    f"Rad {offset} i {filename} är inte en avsnittsrubrik '## <nummer> <rubrik> (s. N)'."
                )
            number = match["number"]
            if number in seen:
                raise IngestError(f"Rad {offset} i {filename}: avsnitt {number} finns redan.")
            seen.add(number)
            position += 1
            end = int(match["end"] or match["start"])
            if end < int(match["start"]):
                raise IngestError(f"Rad {offset} i {filename}: sidintervallet är bakvänt.")
            current = {
                "number": number,
                "heading": match["heading"].strip(),
                "start": int(match["start"]),
                "end": end,
                "position": position,
            }
            blocks = [[]]
        elif line.startswith("#"):
            raise IngestError(f"Rad {offset} i {filename}: bara rubriker på nivå '## ' används.")
        elif not line.strip():
            if blocks and blocks[-1]:
                blocks.append([])
        elif current is None:
            raise IngestError(f"Rad {offset} i {filename}: text före det första avsnittet.")
        else:
            blocks[-1].append(line.rstrip())
    yield from finish()


# --- Storage ---------------------------------------------------------------------------


async def load_policies(session: AsyncSession, directory: Path) -> dict[str, int]:
    """Make `policy_documents` and `policy_sections` mirror the files in `directory`.

    Returns the run statistics: sections fetched, inserted, updated, unchanged and deleted,
    plus the number of documents.
    """

    files = read_policy_files(directory)
    stats = IngestStats(fetched=sum(len(file.sections) for file in files))
    existing = {document.slug: document for document in await session.scalars(select(PolicyDocument))}
    for file in files:
        document = existing.pop(file.slug, None)
        if document is None:
            document = PolicyDocument(slug=file.slug, **_document_values(file))
            session.add(document)
            await session.flush()
        else:
            assign_changed(document, _document_values(file))
        await _sync_sections(session, document, file.sections, stats)
    for document in existing.values():
        stats.deleted += await _count_sections(session, document)
        await session.delete(document)
    await session.flush()
    log.info("Steering documents: %s files, %s", len(files), stats.as_dict())
    return {**stats.as_dict(), "documents": len(files)}


def _document_values(file: PolicyFile) -> dict[str, object]:
    return {
        "title": file.title,
        "short_title": file.short_title,
        "source_url": file.source_url,
        "decided_by": file.decided_by,
        "decided_on": file.decided_on,
        "diarienummer": file.diarienummer,
        "validity": file.validity,
        "retrieved_on": file.retrieved_on,
    }


async def _count_sections(session: AsyncSession, document: PolicyDocument) -> int:
    rows = await session.scalars(select(PolicySection.id).where(PolicySection.document_id == document.id))
    return len(rows.all())


async def _sync_sections(
    session: AsyncSession, document: PolicyDocument, rows: Sequence[PolicySectionRow], stats: IngestStats
) -> None:
    stored = await session.scalars(select(PolicySection).where(PolicySection.document_id == document.id))
    existing = {section.number: section for section in stored}
    for row in rows:
        values = {
            "heading": row.heading,
            "text": row.text,
            "page_start": row.page_start,
            "page_end": row.page_end,
            "sort_key": row.sort_key,
        }
        section = existing.pop(row.number, None)
        if section is None:
            session.add(PolicySection(document_id=document.id, number=row.number, **values))
            stats.record("inserted")
        else:
            stats.record("updated" if assign_changed(section, values) else "unchanged")
    for section in existing.values():
        await session.delete(section)
        stats.deleted += 1
