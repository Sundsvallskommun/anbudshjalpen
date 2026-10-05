"""LOU: parsing Riksdagen's consolidated text and syncing `lou_sections`."""

from __future__ import annotations

from collections import Counter
from dataclasses import replace

import httpx
import pytest
import respx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.lou import LouRow, consolidated_through, ingest_lou, parse_lou_text, upsert_lou
from anbudsklar.models import LouSection

from .conftest import read_sample

# Synthetic text in Riksdagen's format, covering the tricky cases in a few lines.
SNIPPET = """Lag (2099:1) om provning

SFS nr:     2099:1
Ändrad:     t.o.m. SFS 2099:5
Källa: Test


1 kap. Inledande bestämmelser om
provning

Syfte

1 § Lagen gäller provning. Se även
2 kap. 1 § och 19 a kap. 2 §.

Undantag

Allmänt om undantag

2 § Första stycket.

Andra stycket. Lag (2099:5).

2 a § Tillägg.

2 kap. Ytterligare bestämmelser

1 § Text som hänvisar till
3 kap. Lag (2099:3).

19 kap. eller 19 a kap. Lag (2021:1110).

2 § Huvudregel.

1 § första stycket gäller inte här.

19 a kap. Direktupphandling

1 § Direkt.

Övergångsbestämmelser

1. Denna lag träder i kraft.
"""


@pytest.fixture
def lou_text() -> str:
    return read_sample("riksdagen_sfs-2016-1145.text")


def by_reference(rows: list[LouRow]) -> dict[str, LouRow]:
    return {row.reference: row for row in rows}


# --- Parsing -------------------------------------------------------------------------


def test_snippet_sections_headings_and_wrapped_chapter_titles() -> None:
    rows = parse_lou_text(SNIPPET)

    assert [row.reference for row in rows] == [
        "1 kap. 1 §",
        "1 kap. 2 §",
        "1 kap. 2 a §",
        "2 kap. 1 §",
        "2 kap. 2 §",
        "19 a kap. 1 §",
    ]
    first, second, lettered, cross_reference, ordered, direct = rows
    assert first.chapter_title == "Inledande bestämmelser om provning"
    assert first.heading == "Syfte"
    assert first.text == "Lagen gäller provning. Se även 2 kap. 1 § och 19 a kap. 2 §."
    assert second.heading == "Undantag – Allmänt om undantag"
    assert second.text == "Första stycket.\n\nAndra stycket. Lag (2099:5)."
    assert lettered.heading == second.heading
    assert cross_reference.heading is None
    assert cross_reference.text.endswith("\n\n19 kap. eller 19 a kap. Lag (2021:1110).")
    assert ordered.text == "Huvudregel.\n\n1 § första stycket gäller inte här."
    assert (direct.chapter, direct.chapter_title) == ("19 a", "Direktupphandling")
    assert [row.sort_key for row in rows] == [1, 2, 3, 4, 5, 6]
    assert consolidated_through(SNIPPET) == "SFS 2099:5"


def test_recorded_lou_text_has_all_sections(lou_text: str) -> None:
    rows = parse_lou_text(lou_text)
    per_chapter = Counter(row.chapter for row in rows)

    assert consolidated_through(lou_text) == "SFS 2026:880"
    assert len(rows) == 422
    assert len(per_chapter) == 22  # 22 kap. is repealed; 19 a kap. exists
    assert per_chapter["6"] == 41 and per_chapter["19 a"] == 17 and per_chapter["21"] == 15
    assert sum(1 for row in rows if " " in row.section) == 19
    assert all(row.heading for row in rows)


def test_recorded_lou_text_known_sections(lou_text: str) -> None:
    sections = by_reference(parse_lou_text(lou_text))

    principles = sections["4 kap. 1 §"]
    assert principles.chapter_title == "Allmänna bestämmelser"
    assert principles.heading == "Principer för offentlig upphandling"
    assert principles.text.startswith("Upphandlande myndigheter ska behandla leverantörer på ett likvärdigt")

    standstill = sections["20 kap. 1 §"]
    assert standstill.heading == "Avtalsspärr – Allmänna bestämmelser om avtalsspärr"
    assert "10 dagar" in standstill.text and "\n\n" in standstill.text

    assert sections["1 kap. 3 a §"].text.endswith("Lag (2018:859).")
    assert "700 000 kronor" in sections["19 a kap. 2 §"].text
    assert "5 kap. 13 §" in sections  # missing from Riksdagen's HTML version, present in the text


# --- Storage -------------------------------------------------------------------------


async def test_ingest_stores_sections_and_reruns_cleanly(
    respx_mock: respx.MockRouter,
    client: httpx.AsyncClient,
    settings: Settings,
    db_session: AsyncSession,
    lou_text: str,
) -> None:
    route = respx_mock.get(settings.riksdagen_lou_url).mock(return_value=httpx.Response(200, text=lou_text))

    first = await ingest_lou(db_session, client, settings)
    second = await ingest_lou(db_session, client, settings)

    assert first == {"fetched": 422, "inserted": 422, "updated": 0}
    assert second == {"fetched": 422, "inserted": 0, "updated": 0, "unchanged": 422}
    assert route.call_count == 2
    stored = await db_session.scalar(
        select(LouSection).where(LouSection.chapter == "20", LouSection.section == "1")
    )
    assert stored is not None
    assert stored.heading == "Avtalsspärr – Allmänna bestämmelser om avtalsspärr"
    assert stored.consolidated_through == "SFS 2026:880"


async def test_upsert_updates_changed_and_deletes_repealed_sections(db_session: AsyncSession) -> None:
    rows = parse_lou_text(SNIPPET)
    await upsert_lou(db_session, rows, "SFS 2099:5")

    amended = [replace(rows[0], text="Ny lydelse. Lag (2099:6)."), *rows[1:4]]
    stats = await upsert_lou(db_session, amended, "SFS 2099:6")

    # The snippet's 19 a kap. section and its last regular section are both repealed.
    assert stats.as_dict() == {"fetched": 4, "inserted": 0, "updated": 4, "deleted": len(rows) - 4}
    remaining = (await db_session.scalars(select(LouSection).order_by(LouSection.sort_key))).all()
    assert [(row.chapter, row.section) for row in remaining] == [
        ("1", "1"),
        ("1", "2"),
        ("1", "2 a"),
        ("2", "1"),
    ]
    assert remaining[0].text == "Ny lydelse. Lag (2099:6)."
    assert {row.consolidated_through for row in remaining} == {"SFS 2099:6"}


async def test_unrecognised_text_is_rejected_before_anything_is_stored(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings, db_session: AsyncSession
) -> None:
    respx_mock.get(settings.riksdagen_lou_url).mock(return_value=httpx.Response(200, text=SNIPPET))

    with pytest.raises(IngestError, match="kunde inte delas upp i paragrafer"):
        await ingest_lou(db_session, client, settings)
    assert (await db_session.scalars(select(LouSection))).first() is None
