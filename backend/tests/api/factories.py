"""Fictitious test data for API, service and worker tests.

All names, companies and documents are made up. Dates are relative to today so that
deadlines stay in the future whenever the tests run.
"""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.contracts import (
    CONTRACT_VERSION,
    Checklist,
    Citation,
    EvaluationCriterion,
    KeyDate,
    RequiredAttachment,
    Requirement,
)
from anbudsklar.models import (
    Agreement,
    ChecklistRecord,
    Company,
    CpvCode,
    Document,
    DocumentPage,
    LouSection,
    Notice,
    PolicyDocument,
    PolicySection,
    User,
)
from anbudsklar.services.dates import STOCKHOLM
from anbudsklar.worker.mail import MailError, MailMessage

PUBLIC_URL = "http://anbudsklar.test"

INSURANCE_SENTENCE = "Anbudsgivaren ska ha en ansvarsförsäkring om minst 5 miljoner kronor."
REFERENCE_SENTENCE = (
    "Anbudsgivaren ska redovisa två referensuppdrag i offentlig miljö under de senaste tre åren."
)
CERTIFICATE_SENTENCE = "Försäkringsbevis ska bifogas anbudet."
PRICE_SENTENCE = "Anbuden utvärderas på pris 70 procent och kvalitet 30 procent."


def question_sentence(day: date) -> str:
    return f"Frågor ska ställas via e-Avrop senast {day.isoformat()}."


def deadline_sentence(day: date) -> str:
    return f"Anbud ska ha kommit in senast {day.isoformat()}."


def document_pages(fragestopp: date, deadline: date) -> list[str]:
    return [
        "Administrativa föreskrifter\n"
        "Upphandlingen avser ommålning av Solbackens förskola i Matfors (fiktivt underlag). "
        f"{question_sentence(fragestopp)} {deadline_sentence(deadline)}",
        f"Kvalificering\n{INSURANCE_SENTENCE} {CERTIFICATE_SENTENCE} {REFERENCE_SENTENCE}",
        f"Utvärdering\n{PRICE_SENTENCE}",
    ]


def demo_checklist(fragestopp: date, deadline: date) -> Checklist:
    return Checklist(
        summary="Ommålning av en förskola. Kraven gäller försäkring och referenser.",
        procedure="Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
        requirements=[
            Requirement(
                id="K1",
                kind="kvalificeringskrav",
                title="Ansvarsförsäkring om minst 5 miljoner kronor",
                plain_language="Företaget behöver en ansvarsförsäkring på minst 5 miljoner kronor.",
                evidence="Försäkringsbevis",
                citation=Citation(page=2, quote=INSURANCE_SENTENCE),
            ),
            Requirement(
                id="K2",
                kind="kvalificeringskrav",
                title="Två referensuppdrag i offentlig miljö",
                plain_language="Visa två liknande uppdrag åt offentliga beställare de senaste tre åren.",
                citation=Citation(page=2, quote=REFERENCE_SENTENCE),
            ),
        ],
        attachments=[
            RequiredAttachment(name="Försäkringsbevis", citation=Citation(page=2, quote=CERTIFICATE_SENTENCE))
        ],
        evaluation=[
            EvaluationCriterion(
                name="Pris",
                weight_percent=70,
                how_assessed="Lägst pris ger högst poäng.",
                citation=Citation(page=3, quote=PRICE_SENTENCE),
            )
        ],
        dates=[
            KeyDate(
                kind="fragestopp",
                date=fragestopp,
                description="Sista dag för frågor",
                citation=Citation(page=1, quote=question_sentence(fragestopp)),
            ),
            KeyDate(
                kind="sista_anbudsdag",
                date=deadline,
                description="Sista dag för anbud",
                citation=Citation(page=1, quote=deadline_sentence(deadline)),
            ),
        ],
    )


def today() -> date:
    return datetime.now(STOCKHOLM).date()


def end_of_day(day: date) -> datetime:
    return datetime.combine(day, time(23, 59), tzinfo=STOCKHOLM)


# --- Rows ---------------------------------------------------------------------------


async def add_company(
    session: AsyncSession,
    *,
    name: str = "Målerifirman i Matfors AB (fiktivt)",
    description: str = "Vi utför invändig och utvändig målning av skolor och förskolor.",
    cpv_codes: list[str] | None = None,
) -> Company:
    company = Company(
        name=name,
        description=description,
        cpv_codes=cpv_codes if cpv_codes is not None else ["45442100"],
        municipalities=["Sundsvall"],
        certifications=[],
        is_fictitious=True,
    )
    session.add(company)
    await session.flush()
    return company


async def add_user(
    session: AsyncSession, *, role: str, email: str, name: str, company: Company | None = None
) -> User:
    user = User(name=name, email=email, role=role, company_id=company.id if company else None)
    session.add(user)
    await session.flush()
    return user


async def add_notice(
    session: AsyncSession,
    *,
    title: str = "Ommålning av Solbackens förskola, Matfors",
    cpv_codes: list[str] | None = None,
    status: str = "open",
    deadline_at: datetime | None = None,
    external_id: str = "TEST-1",
) -> Notice:
    notice = Notice(
        source="fixture",
        external_id=external_id,
        title=title,
        description="Invändig målning av väggar och tak i en förskola.",
        buyer="Sundsvalls kommun",
        cpv_codes=cpv_codes if cpv_codes is not None else ["45442110"],
        notice_type="contract",
        status=status,
        published_at=datetime.now(UTC) - timedelta(days=3),
        deadline_at=deadline_at,
        is_fictitious=True,
        raw={},
    )
    session.add(notice)
    await session.flush()
    return notice


async def add_document(
    session: AsyncSession, notice: Notice, pages: list[str], *, filename: str = "underlag.txt"
) -> Document:
    data = "\f".join(pages).encode()
    digest = hashlib.sha256(data).hexdigest()
    document = Document(
        notice_id=notice.id,
        filename=filename,
        mimetype="text/plain",
        sha256=digest,
        size_bytes=len(data),
        page_count=len(pages),
        storage_path=digest,
        is_fictitious=True,
    )
    session.add(document)
    await session.flush()
    session.add_all(
        DocumentPage(document_id=document.id, page_no=index, text=text)
        for index, text in enumerate(pages, start=1)
    )
    await session.flush()
    return document


async def add_checklist(
    session: AsyncSession,
    notice: Notice,
    document: Document,
    checklist: Checklist,
    *,
    status: str = "published",
) -> ChecklistRecord:
    now = datetime.now(UTC)
    record = ChecklistRecord(
        notice_id=notice.id,
        document_id=document.id,
        status=status,
        engine="heuristic",
        contract_version=CONTRACT_VERSION,
        payload=checklist.model_dump(mode="json"),
        verification={},
        approved_at=now if status in {"approved", "published"} else None,
        published_at=now if status == "published" else None,
        created_at=now,
    )
    session.add(record)
    await session.flush()
    await session.refresh(record)
    return record


async def add_cpv_codes(session: AsyncSession, codes: dict[str, str]) -> None:
    session.add_all(
        CpvCode(code=code, label_sv=label, parent_code=None, level=len(code.rstrip("0")))
        for code, label in codes.items()
    )
    await session.flush()


async def add_agreement(
    session: AsyncSession, *, external_id: str, title: str, end_date: date, cpv_codes: list[str]
) -> Agreement:
    agreement = Agreement(
        external_id=external_id,
        title=title,
        category="Bygg",
        cpv_codes=cpv_codes,
        supplier="Exempelleverantören AB (fiktiv)",
        end_date=end_date,
        extension_months=[],
        is_fictitious=True,
    )
    session.add(agreement)
    await session.flush()
    return agreement


async def add_lou_section(
    session: AsyncSession, *, chapter: int, section: str, heading: str, text: str
) -> None:
    session.add(
        LouSection(
            chapter=chapter,
            chapter_title="Allmänna bestämmelser",
            section=section,
            heading=heading,
            text=text,
        )
    )
    await session.flush()


STRATEGY_URL = "https://sundsvall.se/download/strategi.pdf"


async def add_policy_section(
    session: AsyncSession, *, number: str, heading: str, text: str, page: int = 8
) -> PolicySection:
    """A section of the municipality's procurement strategy, creating the document the first time."""

    strategy = await session.scalar(select(PolicyDocument).where(PolicyDocument.slug == "inkopsstrategi"))
    if strategy is None:
        strategy = PolicyDocument(
            slug="inkopsstrategi",
            title="Inköpsstrategi för Sundsvalls kommun",
            short_title="Inköpsstrategin",
            decided_by="Kommunfullmäktige",
            decided_on=date(2023, 9, 25),
            source_url=STRATEGY_URL,
        )
        session.add(strategy)
        await session.flush()
    section = PolicySection(
        document_id=strategy.id,
        number=number,
        heading=heading,
        text=text,
        page_start=page,
        page_end=page,
        sort_key=int(number.replace(".", "")),
    )
    session.add(section)
    await session.flush()
    return section


# --- A complete demo ----------------------------------------------------------------


@dataclass
class Demo:
    company: Company
    other_company: Company
    company_user: User
    other_user: User
    buyer: User
    notice: Notice
    document: Document
    checklist: ChecklistRecord
    fragestopp: date
    deadline: date


async def seed_demo(session: AsyncSession) -> Demo:
    fragestopp = today() + timedelta(days=20)
    deadline = today() + timedelta(days=30)
    company = await add_company(session)
    other_company = await add_company(
        session,
        name="Städbolaget i Timrå AB (fiktivt)",
        description="Vi städar kontor och lager.",
        cpv_codes=["90911200"],
    )
    company_user = await add_user(
        session, role="foretagare", email="anna@example.test", name="Anna Berg", company=company
    )
    other_user = await add_user(
        session, role="foretagare", email="sara@example.test", name="Sara Lind", company=other_company
    )
    buyer = await add_user(session, role="inkopare", email="lars@example.test", name="Lars Holm")
    notice = await add_notice(session, deadline_at=end_of_day(deadline))
    document = await add_document(session, notice, document_pages(fragestopp, deadline))
    checklist = await add_checklist(session, notice, document, demo_checklist(fragestopp, deadline))
    return Demo(
        company=company,
        other_company=other_company,
        company_user=company_user,
        other_user=other_user,
        buyer=buyer,
        notice=notice,
        document=document,
        checklist=checklist,
        fragestopp=fragestopp,
        deadline=deadline,
    )


# --- Test doubles -------------------------------------------------------------------


@dataclass
class RecordingMailer:
    """Collects messages instead of sending them."""

    sent: list[MailMessage] = field(default_factory=list)
    fail: bool = False

    async def send(self, message: MailMessage) -> None:
        if self.fail:
            raise MailError("SMTP is down in this test")
        self.sent.append(message)


def bound_session_factory(session: AsyncSession) -> Callable[[], AbstractAsyncContextManager[AsyncSession]]:
    """A session factory that hands out the test's own session (rolled back after the test)."""

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield session
        await session.flush()

    return factory


async def login(client: httpx.AsyncClient, persona: str) -> None:
    response = await client.post("/api/session/login", json={"persona": persona})
    assert response.status_code == 200, response.text
