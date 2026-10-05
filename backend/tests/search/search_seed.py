"""Seed data for the search query tests (fixtures in conftest.py wrap these functions).

Notices and documents are fictitious. CPV labels follow the public CPV 2008
vocabulary; LOU rows are short excerpts of SFS 2016:1145 (statutes are public domain).
Everything is written inside the test transaction and rolled back afterwards.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.documents.extract import TEXT_MIMETYPE
from anbudsklar.documents.store import store_document
from anbudsklar.models import CpvCode, Document, LouSection, Notice

NOW = datetime.now(UTC)


def _notice(key: str, title: str, cpv: list[str], status: str, source: str, **fields: object) -> Notice:
    return Notice(
        source=source,
        external_id=f"search-test-{key}",
        title=title,
        cpv_codes=cpv,
        status=status,
        is_fictitious=True,
        **fields,
    )


async def seed_notices(db_session: AsyncSession) -> dict[str, Notice]:
    rows = {
        "malning": _notice(
            "malning",
            "Ommålning av Solbackens förskola, Matfors",
            ["45442110", "45442100"],
            "open",
            "fixture",
            description="Invändig och utvändig målning av förskolebyggnad.",
            buyer="Sundsvalls kommun",
            published_at=NOW - timedelta(days=5),
            deadline_at=NOW + timedelta(days=20),
        ),
        "stad": _notice(
            "stad",
            "Städtjänster för kommunens förskolor",
            ["90911200"],
            "open",
            "fixture",
            published_at=NOW - timedelta(days=2),
            deadline_at=NOW + timedelta(days=30),
        ),
        "frukt": _notice(
            "frukt",
            "Livsmedel – frukt och grönt",
            ["03221000", "03222000"],
            "closed",
            "ted",
            published_at=NOW - timedelta(days=40),
            deadline_at=NOW - timedelta(days=10),
        ),
        "snorojning": _notice(
            "snorojning",
            "Snöröjning inom område syd",
            ["90620000"],
            "awarded",
            "ted",
            published_at=NOW - timedelta(days=100),
        ),
        "tak": _notice("tak", "Takrenovering Hedbergska skolan", ["45261210"], "planned", "eavrop"),
    }
    db_session.add_all(rows.values())
    await db_session.flush()
    return rows


@dataclass(frozen=True)
class Tender:
    notice: Notice
    main: Document
    annex: Document
    other_notice: Notice


MAIN_PAGES = (
    "1 Administrativa föreskrifter\nSista anbudsdag är 2026-11-14. Frågor ställs via e-Avrop.",
    "2 Kvalificering\nAnbudsgivaren ska inneha en giltig ansvarsförsäkring om minst 5 000 000 kronor.\n"
    "Försäkringsbevis ska bifogas anbudet. Leverantören ska vara registrerad för F-skatt.",
    "3 Kravspecifikation\nArbetet ska utföras enligt AMA Hus 21. Målning ska ske med miljömärkt färg.",
    "4 Utvärdering\nPris 70 %, kvalitet 30 %. Kvaliteten bedöms utifrån genomförandebeskrivningen.",
)
ANNEX_PAGES = ("Bilaga 1 Prisbilaga\nTimpris för målare anges i kronor exklusive moms.",)


async def _store_text(
    session: AsyncSession, notice: Notice, filename: str, pages: tuple[str, ...]
) -> Document:
    return await store_document(
        session,
        notice_id=notice.id,
        filename=filename,
        mimetype=TEXT_MIMETYPE,
        data="\f".join(pages).encode(),
        is_fictitious=True,
    )


async def seed_tender(db_session: AsyncSession) -> Tender:
    notice = _notice("tender", "Ommålning av Solbackens förskola", ["45442110"], "open", "fixture")
    other = _notice("other", "Annan upphandling med försäkringskrav", ["45442110"], "open", "fixture")
    db_session.add_all([notice, other])
    await db_session.flush()
    main = await _store_text(db_session, notice, "Förfrågningsunderlag Solbacken.txt", MAIN_PAGES)
    annex = await _store_text(db_session, notice, "Prisbilaga.txt", ANNEX_PAGES)
    await _store_text(
        db_session,
        other,
        "Annat underlag.txt",
        ("Anbudsgivaren ska ha ansvarsförsäkring om 2 000 000 kronor.",),
    )
    return Tender(notice=notice, main=main, annex=annex, other_notice=other)


CPV_ROWS = (
    ("45000000", "Byggnadsarbete", None, 1),
    ("45400000", "Slutbehandling av byggnader", "45000000", 2),
    ("45440000", "Målnings- och glasarbeten", "45400000", 3),
    ("45442000", "Ytbehandlingsarbeten", "45440000", 4),
    ("45442100", "Målning", "45442000", 5),
    ("45442110", "Målning av byggnader", "45442100", 6),
    ("45442120", "Målning av och skyddsbeläggning på konstruktioner", "45442100", 6),
    ("44810000", "Färger", "44800000", 3),
    ("90910000", "Rengöring", "90900000", 3),
    ("90911000", "Rengöring av bostäder, byggnader och fönster", "90910000", 4),
    ("90911200", "Byggnadsstädning", "90911000", 5),
    ("90919200", "Kontorsstädning", "90919000", 5),
    ("03221000", "Grönsaker", "03220000", 4),
    ("03222000", "Frukt och nötter", "03220000", 4),
)


async def seed_cpv_codes(db_session: AsyncSession) -> None:
    db_session.add_all(
        CpvCode(code=code, label_sv=label, parent_code=parent, level=level)
        for code, label, parent, level in CPV_ROWS
    )
    await db_session.flush()


LOU_ROWS = (
    (
        1,
        "Lagens innehåll och tillämpningsområde",
        "3 a",
        "Undantag från förvaltningslagen",
        "Om förvaltningslagen (2017:900) är tillämplig i ett ärende om upphandling, ska den upphandlande "
        "myndigheten inte tillämpa 10 och 25 §§ i den lagen.",
    ),
    (
        4,
        "Allmänna bestämmelser",
        "1",
        "Principer för offentlig upphandling",
        "Upphandlande myndigheter ska behandla leverantörer på ett likvärdigt och icke-diskriminerande sätt "
        "samt genomföra upphandlingar på ett öppet sätt. Upphandlingar ska vidare genomföras i enlighet med "
        "principerna om ömsesidigt erkännande och proportionalitet.",
    ),
    (
        12,
        "Tilldelning av kontrakt",
        "12",
        "Underrättelse om beslut",
        "En upphandlande myndighet ska snarast möjligt lämna skriftlig underrättelse till anbudssökande och "
        "anbudsgivare om de beslut som fattats om att tilldela ett kontrakt eller ingå ett ramavtal.",
    ),
    (
        20,
        "Avtalsspärr, överprövning och skadestånd",
        "1",
        "Avtalsspärr – Allmänna bestämmelser om avtalsspärr",
        "Om en upphandlande myndighet är skyldig att skicka en underrättelse om tilldelningsbeslut får "
        "myndigheten inte ingå avtal förrän 10 dagar har gått från det att underrättelsen skickades.",
    ),
)


async def seed_lou_sections(db_session: AsyncSession) -> dict[str, LouSection]:
    rows = {
        f"{chapter}:{section}": LouSection(
            chapter=str(chapter),
            chapter_title=chapter_title,
            section=section,
            heading=heading,
            text=text,
            sort_key=chapter * 1000 + index,
            consolidated_through="SFS 2026:880",
        )
        for index, (chapter, chapter_title, section, heading, text) in enumerate(LOU_ROWS)
    }
    db_session.add_all(rows.values())
    await db_session.flush()
    return rows
