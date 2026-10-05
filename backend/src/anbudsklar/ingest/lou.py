"""LOU (lagen om offentlig upphandling, SFS 2016:1145) from Riksdagen's open data.

We fetch the consolidated plain text and split it into one row per section (paragraf),
so that the rules help and the MCP tools can cite "20 kap. 1 §" instead of a whole law.
Statutes are not protected by copyright (upphovsrättslagen 9 §).

The text format (verified on the text consolidated through SFS 2026:880):
- a metadata header ("SFS nr:", "Ändrad: t.o.m. SFS 2026:880", ...) ended by two blank lines;
- chapter lines "N kap. Title" or "19 a kap. Title", whose title may wrap onto a second line;
- headings: short unpunctuated blocks directly before a section or another heading;
- sections starting "N §" or "N a §", with stycken separated by blank lines and hard
  line wraps at about 62 characters, often ending with an amendment note "Lag (2021:1110).";
- transitional provisions ("Övergångsbestämmelser") and annexes ("Bilaga 1") at the end,
  which are not sections and are left out.

Cross-references in running text can also start a line ("19 kap. eller 19 a kap. ..."), so
the parser works on whole blocks and requires chapter and section numbers to increase.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError, IngestStats, assign_changed
from anbudsklar.ingest.http import ensure_ok, send
from anbudsklar.models import LouSection

log = logging.getLogger(__name__)

# The consolidated text has 422 sections; far fewer means the format changed, and storing
# the result would wipe sections that are still in force.
MIN_SECTIONS = 300

CHAPTER_RE = re.compile(r"^(?P<num>\d+(?: [a-z])?) kap\. (?P<title>\S.*)$")
SECTION_RE = re.compile(r"^(?P<num>\d+(?: [a-z])?) § ?(?P<rest>.*)$", re.S)
AMENDMENT_RE = re.compile(r"Lag \(\d{4}:\d+\)\.?$")
CONSOLIDATED_RE = re.compile(r"^Ändrad:\s*t\.o\.m\.\s*SFS\s*(\d{4}:\d+)", re.M)
END_RE = re.compile(r"^(?:Övergångsbestämmelser|Bilaga \d)", re.M)
LIST_ITEM_RE = re.compile(r"^(?:\d+\.|[a-z]\)|-) ")
TRAILING_PUNCTUATION_RE = re.compile(r"[.,:;)]$")
MAX_HEADING_LENGTH = 220


@dataclass(frozen=True)
class LouRow:
    """One section of LOU as parsed from Riksdagen's text."""

    chapter: str  # "4" or "19 a"
    chapter_title: str
    section: str  # "1" or "2 a"
    heading: str | None  # nearest headings above the section; nested ones joined with " – "
    text: str  # stycken separated by blank lines, line wraps removed
    sort_key: int  # position in the law, 1-based

    @property
    def reference(self) -> str:
        return f"{self.chapter} kap. {self.section} §"


# --- Parsing (pure) --------------------------------------------------------------------


def consolidated_through(text: str) -> str | None:
    """The last amendment included in the text, e.g. "SFS 2026:880"."""

    match = CONSOLIDATED_RE.search(text)
    return f"SFS {match.group(1)}" if match else None


def parse_lou_text(text: str) -> list[LouRow]:
    """Split Riksdagen's consolidated LOU text into sections."""

    blocks = _blocks(text)
    _classify(blocks)
    _mark_headings(blocks)
    return _build_rows(blocks)


def number_key(number: str) -> tuple[int, str]:
    """Sort key for "19" and "19 a" style numbers."""

    digits, _, letter = number.partition(" ")
    return int(digits), letter


@dataclass
class _Block:
    """One blank-line separated block of the law text, with line wraps removed."""

    text: str
    kind: str = "para"  # chapter | section | heading | para
    number: str = ""  # chapter or section number
    rest: str = ""  # chapter title, or the first stycke of a section


@dataclass
class _Draft:
    chapter: str
    chapter_title: str
    section: str
    heading: str | None
    paragraphs: list[str] = field(default_factory=list)


def _blocks(text: str) -> list[_Block]:
    text = text.replace("\r\n", "\n")
    _header, _, body = text.partition("\n\n\n")
    body = END_RE.split(body, maxsplit=1)[0]
    blocks: list[_Block] = []
    for chunk in re.split(r"\n[ \t]*\n", body):
        unwrapped = " ".join(line.strip() for line in chunk.splitlines() if line.strip())
        if unwrapped:
            blocks.append(_Block(unwrapped))
    return blocks


def _classify(blocks: Sequence[_Block]) -> None:
    """Mark chapter and section blocks, requiring their numbers to increase."""

    last_chapter: tuple[int, str] = (0, "")
    last_section: tuple[int, str] = (0, "")
    for block in blocks:
        chapter = CHAPTER_RE.match(block.text)
        section = SECTION_RE.match(block.text)
        if (
            chapter
            and number_key(chapter["num"]) > last_chapter
            and "§" not in block.text
            and not AMENDMENT_RE.search(block.text)
        ):
            block.kind, block.number, block.rest = "chapter", chapter["num"], chapter["title"].strip()
            last_chapter, last_section = number_key(block.number), (0, "")
        elif section and last_chapter > (0, "") and number_key(section["num"]) > last_section:
            block.kind, block.number, block.rest = "section", section["num"], section["rest"].strip()
            last_section = number_key(block.number)


def _is_heading_like(text: str) -> bool:
    if len(text) >= MAX_HEADING_LENGTH or AMENDMENT_RE.search(text) or LIST_ITEM_RE.match(text):
        return False
    return not TRAILING_PUNCTUATION_RE.search(text) or text.endswith("m.m.")


def _mark_headings(blocks: Sequence[_Block]) -> None:
    """A heading-like paragraph is a heading when a section or another heading follows it."""

    following: str | None = None
    for block in reversed(blocks):
        if block.kind == "para" and following in ("section", "heading") and _is_heading_like(block.text):
            block.kind = "heading"
        following = block.kind


def _build_rows(blocks: Sequence[_Block]) -> list[LouRow]:
    drafts: list[_Draft] = []
    chapter = chapter_title = ""
    heading: str | None = None
    pending_headings: list[str] = []
    current: _Draft | None = None
    for block in blocks:
        if block.kind == "chapter":
            chapter, chapter_title = block.number, block.rest
            heading, pending_headings, current = None, [], None
        elif block.kind == "heading":
            pending_headings.append(block.text)
            current = None
        elif block.kind == "section":
            if pending_headings:
                heading, pending_headings = " – ".join(pending_headings), []
            current = _Draft(chapter, chapter_title, block.number, heading, [block.rest])
            drafts.append(current)
        elif current is not None:
            current.paragraphs.append(block.text)
    return [
        LouRow(
            chapter=draft.chapter,
            chapter_title=draft.chapter_title,
            section=draft.section,
            heading=draft.heading,
            text="\n\n".join(draft.paragraphs),
            sort_key=position,
        )
        for position, draft in enumerate(drafts, start=1)
    ]


# --- Storage ---------------------------------------------------------------------------


def _stored_chapter(chapter: str) -> str | None:
    """The chapter as stored in `LouSection.chapter`: "4", or "19 a" for lettered chapters."""

    return chapter.strip() or None


async def upsert_lou(session: AsyncSession, rows: Sequence[LouRow], consolidated: str | None) -> IngestStats:
    """Make `lou_sections` mirror the parsed text: insert, update and delete sections."""

    stats = IngestStats(fetched=len(rows))
    stored_sections = await session.scalars(select(LouSection))
    existing = {(section.chapter, section.section): section for section in stored_sections}
    seen: set[tuple[str, str]] = set()
    for row in rows:
        chapter = _stored_chapter(row.chapter)
        if chapter is None:
            stats.skipped += 1
            continue
        key = (chapter, row.section)
        seen.add(key)
        values = {
            "chapter_title": row.chapter_title,
            "heading": row.heading,
            "text": row.text,
            "sort_key": row.sort_key,
            "consolidated_through": consolidated,
        }
        stored = existing.get(key)
        if stored is None:
            session.add(LouSection(chapter=chapter, section=row.section, **values))
            stats.record("inserted")
        else:
            stats.record("updated" if assign_changed(stored, values) else "unchanged")
    for key, stored in existing.items():
        if key not in seen:
            await session.delete(stored)
            stats.deleted += 1
    await session.flush()
    if stats.skipped:
        log.warning(
            "LOU: %s sections in lettered chapters were not stored (integer chapter column)", stats.skipped
        )
    return stats


async def ingest_lou(session: AsyncSession, client: httpx.AsyncClient, settings: Settings) -> dict[str, int]:
    """Fetch the consolidated LOU text from Riksdagen and store it section by section."""

    response = await send(client, "GET", settings.riksdagen_lou_url, settings=settings)
    text = ensure_ok(response, "Riksdagens öppna data").text
    rows = parse_lou_text(text)
    if len(rows) < MIN_SECTIONS:
        raise IngestError(
            f"LOU-texten kunde inte delas upp i paragrafer (hittade {len(rows)}). Formatet kan ha ändrats."
        )
    stats = await upsert_lou(session, rows, consolidated_through(text))
    log.info("LOU ingestion: %s", stats.as_dict())
    return stats.as_dict()
