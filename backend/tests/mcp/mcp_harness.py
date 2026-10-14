"""Helpers for the MCP tests: fictitious seeded rows and an in-process app with the MCP routes.

The app is driven with the official MCP SDK client over streamable HTTP through
httpx's ASGI transport, so no network or uvicorn is involved. Tools share the test's
database session, so they see the seeded rows that the test rolls back afterwards.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import FastAPI
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, EmbeddedResource, TextContent, TextResourceContents
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.contracts import CONTRACT_VERSION, Checklist
from anbudsklar.mcp import build_mcp
from anbudsklar.mcp.context import SessionFactory
from anbudsklar.mcp.output import STOCKHOLM
from anbudsklar.models import (
    Agreement,
    ChecklistRecord,
    Company,
    CpvCode,
    Document,
    DocumentPage,
    LouSection,
    MatchRecord,
    Notice,
    PolicyDocument,
    PolicySection,
    PublishedAnswer,
    QuestionLog,
)
from anbudsklar.services.dates import add_months
from mcp import ClientSession

KEY = "mcp-testnyckel-1"
BASE_URL = "http://localhost:3001"  # FastMCP allows only listed Host headers (421 otherwise)
PUBLIC_URL = "https://anbudsklar.test"
COMPANY_SECRET = "HEMLIG-FORETAGSUPPGIFT-7731"
DRAFT_SECRET = "OGRANSKAT-UTKAST-5512"

PAGES = [
    "Innehållsförteckning\n1 Administrativa föreskrifter\n2 Kvalificering\n3 Utvärdering\n4 Avtalsvillkor",
    "Kvalificering\nLeverantören ska ha en ansvarsförsäkring om minst 5 miljoner kronor. "
    "Försäkringsbevis ska bifogas anbudet.",
    "Leverantören ska redovisa två referensuppdrag i offentlig miljö under de senaste tre åren på "
    "bifogad referensblankett.",
    "Utvärdering\nPris viktas 70 procent och kvalitet 30 procent. Kvalitet bedöms utifrån "
    "genomförandebeskrivningen.",
    "Avtalsvillkor\nBetalning sker 30 dagar efter godkänd faktura.",
    "Bilagor\nPrisbilaga, referensblankett och sanningsförsäkran ska lämnas med anbudet.",
]
SECTIONS = ["administrativa", "kvalificering", "kvalificering", "utvardering", "avtalsvillkor", "bilagor"]


@dataclass(frozen=True)
class Seeded:
    notice: Notice
    document: Document
    draft_only: Notice
    closed: Notice


def citation(
    page: int, quote: str, check: str = "verified", found_page: int | None = None
) -> dict[str, object]:
    return {"page": page, "quote": quote, "check": check, "found_page": found_page}


PUBLISHED_CHECKLIST = Checklist.model_validate(
    {
        "summary": "Ommålning av en förskola. Fiktivt demounderlag.",
        "procedure": "Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
        "requirements": [
            {
                "id": "K1",
                "kind": "skallkrav",
                "title": "Ansvarsförsäkring",
                "plain_language": "Företaget måste ha en ansvarsförsäkring på minst 5 miljoner kronor.",
                "evidence": "Försäkringsbevis",
                "citation": citation(2, "ansvarsförsäkring om minst 5 miljoner kronor"),
            },
            {
                "id": "K2",
                "kind": "kvalificeringskrav",
                "title": "Två referensuppdrag",
                "plain_language": "Två liknande uppdrag i offentlig miljö de senaste tre åren.",
                "citation": citation(2, "två referensuppdrag i offentlig miljö", "moved", 3),
            },
        ],
        "attachments": [
            {"name": "Referensblankett", "citation": citation(6, "referensblankett", "unverified")},
        ],
        "evaluation": [
            {
                "name": "Pris",
                "weight_percent": 70,
                "how_assessed": "Lägst pris får högst poäng.",
                "citation": citation(4, "Pris viktas 70 procent"),
            }
        ],
        "dates": [
            {
                "kind": "sista_anbudsdag",
                "date": (date.today() + timedelta(days=20)).isoformat(),
                "description": "Anbudet ska vara inlämnat.",
                "citation": citation(1, "Administrativa föreskrifter"),
            }
        ],
        "terms": [{"term": "Skallkrav", "explanation": "Ett krav som måste vara uppfyllt."}],
        "open_questions": ["Det framgår inte om ställning ingår."],
    }
)


def _draft_checklist() -> dict[str, object]:
    draft = PUBLISHED_CHECKLIST.model_copy(update={"summary": f"Utkast {DRAFT_SECRET}"})
    return draft.model_dump(mode="json")


def _notice(**values: object) -> Notice:
    defaults: dict[str, object] = {
        "source": "fixture",
        "buyer": "Sundsvalls kommun",
        "is_fictitious": True,
        "published_at": datetime.now(UTC) - timedelta(days=5),
    }
    return Notice(**{**defaults, **values})


async def seed(db_session: AsyncSession) -> Seeded:
    """Public rows the tools may show, plus company and draft rows they must never show."""

    now = datetime.now(UTC)
    today = datetime.now(STOCKHOLM).date()
    notice = _notice(
        external_id=f"mcp-{uuid.uuid4().hex[:8]}",
        title="Ommålning av Solbackens förskola, Matfors",
        description="Invändig och utvändig målning av förskolans byggnader.",
        cpv_codes=["45442100", "45442110"],
        status="open",
        deadline_at=now + timedelta(days=20),
        procedure="Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
        url="https://www.e-avrop.com/sundsvall/e-Upphandling/Announcement.aspx?id=900001",
    )
    draft_only = _notice(
        external_id=f"mcp-{uuid.uuid4().hex[:8]}",
        title="Städtjänster för kommunens förskolor",
        cpv_codes=["90911200"],
        status="open",
        deadline_at=now + timedelta(days=30),
    )
    closed = _notice(
        external_id=f"mcp-{uuid.uuid4().hex[:8]}",
        title="Livsmedel – frukt och grönt",
        cpv_codes=["03221000"],
        status="closed",
        deadline_at=now - timedelta(days=60),
    )
    db_session.add_all([notice, draft_only, closed])
    await db_session.flush()

    document = Document(
        notice_id=notice.id,
        filename="Förfrågningsunderlag Solbacken.pdf",
        mimetype="application/pdf",
        sha256=uuid.uuid4().hex * 2,
        size_bytes=1000,
        page_count=len(PAGES),
        storage_path="/dev/null",
        is_fictitious=True,
    )
    db_session.add(document)
    await db_session.flush()
    db_session.add_all(
        DocumentPage(document_id=document.id, page_no=number, text=text, section=section)
        for number, (text, section) in enumerate(zip(PAGES, SECTIONS, strict=True), start=1)
    )
    db_session.add_all(
        [
            ChecklistRecord(
                notice_id=notice.id,
                document_id=document.id,
                status="published",
                engine="heuristic",
                contract_version=CONTRACT_VERSION,
                payload=PUBLISHED_CHECKLIST.model_dump(mode="json"),
                published_at=now - timedelta(days=1),
            ),
            # A newer draft for the same notice must not win over the published one.
            ChecklistRecord(
                notice_id=notice.id,
                document_id=document.id,
                status="draft",
                engine="heuristic",
                contract_version=CONTRACT_VERSION,
                payload=_draft_checklist(),
            ),
            ChecklistRecord(
                notice_id=draft_only.id,
                document_id=document.id,
                status="draft",
                engine="heuristic",
                contract_version=CONTRACT_VERSION,
                payload=_draft_checklist(),
            ),
        ]
    )
    db_session.add_all(_lou_sections() + _policy_sections() + _cpv_codes() + _agreements(today))
    company = Company(name="Testföretaget AB", description=COMPANY_SECRET, is_fictitious=True)
    db_session.add(company)
    await db_session.flush()
    db_session.add_all(
        [
            QuestionLog(notice_id=notice.id, company_id=company.id, question=f"Fråga {COMPANY_SECRET}"),
            MatchRecord(
                company_id=company.id,
                notice_id=notice.id,
                fit="passar",
                engine="heuristic",
                payload={"summary": COMPANY_SECRET},
            ),
            # The buyer's published answers (decision 0013): public, and never who asked.
            PublishedAnswer(
                notice_id=notice.id,
                source="eavrop",
                external_key="a" * 64,
                question="Ska ställning ingå i priset?",
                answer="Ja, ställning ingår i anbudspriset.",
                asked_at=now - timedelta(days=4),
                answered_at=now - timedelta(days=3),
            ),
            PublishedAnswer(
                notice_id=notice.id,
                source="eavrop",
                external_key="b" * 64,
                question="Gäller kravet på F-skatt även underleverantörer?",
                answer="Ja.",
                asked_at=now - timedelta(days=3),
                answered_at=now - timedelta(days=2),
            ),
        ]
    )
    await db_session.flush()
    return Seeded(notice=notice, document=document, draft_only=draft_only, closed=closed)


def _lou_sections() -> list[LouSection]:
    consolidated = "SFS 2026:880"
    return [
        LouSection(
            chapter="4",
            chapter_title="Allmänna bestämmelser",
            section="1",
            heading="Principer för offentlig upphandling",
            text="Upphandlande myndigheter ska behandla leverantörer på ett likvärdigt och "
            "icke-diskriminerande sätt samt genomföra upphandlingar på ett öppet sätt.",
            sort_key=40001,
            consolidated_through=consolidated,
        ),
        LouSection(
            chapter="20",
            chapter_title="Avtalsspärr, överprövning och skadestånd",
            section="1",
            heading="Allmänna bestämmelser om avtalsspärr",
            text="Om en upphandlande myndighet är skyldig att skicka en underrättelse om tilldelningsbeslut "
            "får myndigheten inte ingå avtal förrän 10 dagar har gått (avtalsspärr).",
            sort_key=200001,
            consolidated_through=consolidated,
        ),
    ]


STRATEGY_URL = "https://sundsvall.se/download/strategi.pdf"


def _policy_sections() -> list[PolicySection]:
    """Two sections of the municipality's procurement strategy (a public decision, not fictitious)."""

    strategy = PolicyDocument(
        slug="inkopsstrategi",
        title="Inköpsstrategi för Sundsvalls kommun",
        short_title="Inköpsstrategin",
        decided_by="Kommunfullmäktige",
        decided_on=date(2023, 9, 25),
        diarienummer="KSK-2023-00196",
        source_url=STRATEGY_URL,
        retrieved_on=date(2026, 10, 14),
    )
    return [
        PolicySection(
            document=strategy,
            number="5.2",
            heading="Hållbara inköp",
            text="Sundsvalls kommuns inköp ska vara hållbara.\n\n- Anlita socialt ansvarsfulla "
            "leverantörer. Minimivillkor motsvarande ett centralt kollektivavtal ska alltid ställas i "
            "upphandlingar där det finns risk för oskäliga arbetsvillkor, krav på villkor i nivå med "
            "kollektivavtal ska gälla även för underleverantörer i obegränsat antal led.",
            page_start=8,
            page_end=9,
            sort_key=10,
        ),
        PolicySection(
            document=strategy,
            number="5.3",
            heading="Konkurrensinriktade inköp",
            text="Sundsvalls kommuns inköp ska tillvarata och vårda konkurrensen på de olika marknaderna.\n\n"
            "- Tillvarata småföretagens konkurrenskraft, t.ex. genom att undanröja hinder såsom "
            "oproportionerliga krav, krånglig administration och alltför omfattande kontrakt.",
            page_start=9,
            page_end=9,
            sort_key=11,
        ),
    ]


def _cpv_codes() -> list[CpvCode]:
    rows = [
        ("45000000", "Anläggningsarbete", None, 1),
        ("45400000", "Färdigställande byggnadsarbeten", "45000000", 2),
        ("45440000", "Målning och glassättning", "45400000", 3),
        ("45442000", "Påstrykning av skyddsöverdrag", "45440000", 4),
        ("45442100", "Målning", "45442000", 5),
        ("90911200", "Rengöring av byggnader", None, 4),
        ("03221000", "Grönsaker", None, 3),
    ]
    return [
        CpvCode(code=code, label_sv=label, parent_code=parent, level=level)
        for code, label, parent, level in rows
    ]


def _agreements(today: date) -> list[Agreement]:
    def agreement(external_id: str, title: str, cpv: list[str], end: date) -> Agreement:
        return Agreement(
            external_id=f"{external_id}-{uuid.uuid4().hex[:6]}",
            title=title,
            category="Test",
            cpv_codes=cpv,
            end_date=end,
            previous_requirements="Ansvarsförsäkring och två referenser.",
            is_fictitious=True,
        )

    return [
        agreement("A1", "Ramavtal måleriarbeten", ["45442100"], add_months(today, 14)),
        agreement("A2", "Livsmedel frukt och grönt", ["03221000"], add_months(today, 11)),
        agreement("A3", "Fordonsleasing", ["34110000"], add_months(today, 30)),
        agreement("A4", "Avslutat avtal", ["45442100"], today - timedelta(days=10)),
    ]


# --- App and client -----------------------------------------------------------------


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {"public_url": PUBLIC_URL, "mcp_api_keys": [SecretStr(KEY)]}
    return Settings.model_validate({**values, **overrides})


def make_app(
    settings: Settings, session: AsyncSession | None = None, *, sessions: SessionFactory | None = None
) -> FastAPI:
    """A minimal app with the MCP routes and lifespan, like the real app wires them.

    Tools use `sessions` when given, else the test's `session`, else the app's own database.
    """

    if sessions is None and session is not None:
        shared = session

        @asynccontextmanager
        async def share_test_session() -> AsyncIterator[AsyncSession]:
            yield shared

        sessions = share_test_session
    mount = build_mcp(settings) if sessions is None else build_mcp(settings, sessions=sessions)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async with mount.lifespan():
            yield

    app = FastAPI(lifespan=lifespan)
    app.router.routes.extend(mount.routes)
    return app


@asynccontextmanager
async def http_client(app: FastAPI, base_url: str = BASE_URL) -> AsyncIterator[httpx.AsyncClient]:
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url=base_url) as client:
            yield client


@asynccontextmanager
async def mcp_client(
    session: AsyncSession | None,
    *,
    headers: dict[str, str] | None = None,
    sessions: SessionFactory | None = None,
    **settings: object,
) -> AsyncIterator[ClientSession]:
    """An initialized MCP client session against a fresh app (the session manager runs once)."""

    app = make_app(make_settings(**settings), session, sessions=sessions)
    async with http_client(app) as http:
        http.headers.update(headers or {"Authorization": f"Bearer {KEY}"})
        async with (
            streamable_http_client(f"{BASE_URL}/mcp", http_client=http) as (read, write, session_id),
            ClientSession(read, write) as client,
        ):
            await client.initialize()
            assert session_id() is None  # stateless: Eneo never relies on a session
            yield client


def texts(result: CallToolResult) -> str:
    return "".join(block.text for block in result.content if isinstance(block, TextContent))


def resources(result: CallToolResult) -> list[TextResourceContents]:
    found: list[TextResourceContents] = []
    for block in result.content:
        if isinstance(block, EmbeddedResource) and isinstance(block.resource, TextResourceContents):
            found.append(block.resource)
    return found


def everything(result: CallToolResult) -> str:
    return texts(result) + "".join(resource.text for resource in resources(result))
