"""The municipality's steering documents: the committed files and mirroring them into the database."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.policies import POLICY_DIR, load_policies, parse_policy_file, read_policy_files
from anbudsklar.models import PolicyDocument, PolicySection

POLICIES = get_settings().data_dir / POLICY_DIR

# A small synthetic document in the file's form, covering the cases the parser must handle.
SNIPPET = """---
slug: provpolicy
title: Provpolicy för tester
short_title: Provpolicyn
decided_by: Kommunfullmäktige
decided_on: 2024-01-15
source_url: https://example.test/provpolicy.pdf
---

## 1 Syfte (s. 2)

Första stycket.

Andra stycket på en rad.

## 2.1 Punkter (s. 3–4)

Inledning:

- första punkten
- andra punkten
"""


def write(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


# --- Parsing -------------------------------------------------------------------------


def test_snippet_front_matter_sections_pages_and_blocks() -> None:
    policy = parse_policy_file(SNIPPET, "provpolicy.md")

    assert (policy.slug, policy.short_title) == ("provpolicy", "Provpolicyn")
    assert (policy.decided_by, policy.decided_on) == ("Kommunfullmäktige", date(2024, 1, 15))
    assert policy.diarienummer is None and policy.retrieved_on is None
    first, second = policy.sections
    assert (first.number, first.heading, first.page_start, first.page_end) == ("1", "Syfte", 2, 2)
    assert first.text == "Första stycket.\n\nAndra stycket på en rad."
    assert (second.number, second.page_start, second.page_end, second.sort_key) == ("2.1", 3, 4, 2)
    assert second.text == "Inledning:\n\n- första punkten\n- andra punkten"


def front(extra: str = "", slug: str = "x") -> str:
    """A valid front matter for x.md, with `extra` lines before the closing edge."""

    return f"---\nslug: {slug}\ntitle: T\nshort_title: X\nsource_url: u\n{extra}---\n"


ONE_SECTION = "## 1 A (s. 1)\nT\n"


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("slug: x\n", "måste börja med en rad '---'"),
        ("---\nslug: x\ntitle: T\n", "avslutas inte med en rad '---'"),
        ("---\nslug: x\ntitle: T\n---\n" + ONE_SECTION, "saknar uppgifterna short_title, source_url"),
        (front("decided_on: igår\n") + ONE_SECTION, "ÅÅÅÅ-MM-DD"),
        (front(), "har inga avsnitt"),
        (front() + "## 1 Utan sida\nT\n", "Rad 7 i x.md är inte en avsnittsrubrik"),
        (front() + "Text före\n" + ONE_SECTION, "Rad 7 i x.md: text före"),
        (front() + ONE_SECTION + "## 1 B (s. 2)\nT\n", "avsnitt 1 finns redan"),
        (front() + "## 1 A (s. 1)\n\n## 2 B (s. 2)\nT\n", "avsnitt 1 har ingen text"),
        (front() + "## 1 A (s. 3–2)\nT\n", "sidintervallet är bakvänt"),
        (front() + "# Rubrik\n" + ONE_SECTION, "bara rubriker på nivå"),
        (front(slug="annan") + ONE_SECTION, "slug måste vara filnamnet"),
    ],
)
def test_bad_files_are_reported_with_the_file_and_line(content: str, message: str) -> None:
    with pytest.raises(IngestError, match=message):
        parse_policy_file(content, "x.md")


def test_committed_strategy_is_complete() -> None:
    [strategy] = read_policy_files(POLICIES)
    numbers = [section.number for section in strategy.sections]

    assert strategy.slug == "inkopsstrategi" and strategy.short_title == "Inköpsstrategin"
    assert strategy.decided_by == "Kommunfullmäktige" and strategy.decided_on == date(2023, 9, 25)
    assert strategy.diarienummer == "KSK-2023-00196"
    assert strategy.source_url.startswith("https://sundsvall.se/download/")
    assert numbers == [
        "1", "2.1", "2.2", "2.3", "3", "3.1", "4", "5", "5.1", "5.2", "5.3", "5.4",
        "6", "6.1", "6.1.1", "6.1.2", "6.1.3", "6.1.4",
    ]  # fmt: skip
    assert [section.sort_key for section in strategy.sections] == list(range(1, 19))
    assert all(4 <= section.page_start <= section.page_end <= 13 for section in strategy.sections)

    by_number = {section.number: section for section in strategy.sections}
    sustainable = by_number["5.2"]
    assert sustainable.heading == "Hållbara inköp"
    assert (sustainable.page_start, sustainable.page_end) == (8, 9)
    assert "underleverantörer i obegränsat antal led" in sustainable.text
    assert "sommarjobb och praktikplatser" in sustainable.text
    competition = by_number["5.3"]
    assert "Tillvarata småföretagens konkurrenskraft" in competition.text
    assert "Bidra till sänkta trösklar" in competition.text  # a word the PDF's text layer splits
    assert "att genomföra upphandlingar på uppdrag av Timrå kommun" in by_number["6.1.1"].text
    assert by_number["1"].text.endswith("majoritetsägda bolag i Stadsbackenkoncernen.")


# --- Storage -------------------------------------------------------------------------


async def count(session: AsyncSession, model: type[PolicyDocument] | type[PolicySection]) -> int:
    return int(await session.scalar(select(func.count()).select_from(model)) or 0)


async def test_loading_mirrors_the_files_and_reruns_cleanly(db_session: AsyncSession, tmp_path: Path) -> None:
    write(tmp_path, "provpolicy.md", SNIPPET)
    write(tmp_path, "README.md", "# Inte ett styrdokument\n")

    first = await load_policies(db_session, tmp_path)
    assert first == {"fetched": 2, "inserted": 2, "updated": 0, "documents": 1}
    again = await load_policies(db_session, tmp_path)
    assert again == {"fetched": 2, "inserted": 0, "updated": 0, "unchanged": 2, "documents": 1}

    # A changed heading and a removed section are mirrored; the document keeps its id.
    changed = SNIPPET.replace("## 1 Syfte (s. 2)", "## 1 Syfte och mål (s. 2)").split("## 2.1")[0]
    write(tmp_path, "provpolicy.md", changed)
    third = await load_policies(db_session, tmp_path)
    assert third == {"fetched": 1, "inserted": 0, "updated": 1, "deleted": 1, "documents": 1}
    [document] = (await db_session.scalars(select(PolicyDocument))).all()
    sections = (await db_session.scalars(select(PolicySection))).all()
    assert [section.heading for section in sections] == ["Syfte och mål"]
    assert sections[0].document_id == document.id

    # A document whose file is gone leaves the database with its sections.
    (tmp_path / "provpolicy.md").unlink()
    write(tmp_path, "annan.md", SNIPPET.replace("slug: provpolicy", "slug: annan"))
    fourth = await load_policies(db_session, tmp_path)
    assert fourth == {"fetched": 2, "inserted": 2, "updated": 0, "deleted": 1, "documents": 1}
    assert await count(db_session, PolicyDocument) == 1
    assert await count(db_session, PolicySection) == 2


async def test_committed_strategy_loads(db_session: AsyncSession) -> None:
    stats = await load_policies(db_session, POLICIES)
    assert stats["documents"] == 1 and stats["inserted"] == 18
    section = await db_session.scalar(select(PolicySection).where(PolicySection.number == "5.3"))
    assert section is not None and section.document.short_title == "Inköpsstrategin"


async def test_a_missing_folder_is_an_ingest_error(db_session: AsyncSession, tmp_path: Path) -> None:
    with pytest.raises(IngestError, match="finns inte"):
        await load_policies(db_session, tmp_path / "saknas")
