"""Inputs shared by several AI tasks.

These mirror what an Eneo Flow run would receive as form fields and runtime files.
Documents are always passed as text per page so that every engine cites the same page
numbers that our citation verification checks against.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import Field

from anbudsklar.contracts.common import ContractModel

PAGE_MARKER = "[SIDA {page}]"
ANSWER_MARKER = "[SVAR {number}]"
EMPTY_PAGE_TEXT = "(sidan saknar läsbar text, till exempel en bild eller en inskannad sida)"
"""What a page without text says to the model, so it can tell a blank page from one it was not given."""

EAVROP_LAYOUT = "eavrop"
"""`PagedDocument.layout` of a document exported from e-Avrop (see `documents.eavrop_export`)."""
LAYOUT_NOTES: dict[str, str] = {
    EAVROP_LAYOUT: (
        "Dokumentet är exporterat ur e-Avrop, där leverantören svarar i ett elektroniskt formulär. Raden "
        "före en numrerad punkt anger punktens typ i e-Avrop: Kvalificeringskrav, Skakrav, Utvärderingskrav, "
        "Informationsfråga eller Uteslutningsgrund. Kvalificeringskrav och Skakrav är obligatoriska krav; "
        "välj kind efter vad kravet gäller. En Informationsfråga besvaras av leverantören i formuläret: det "
        "den ber om ska lämnas i anbudet. Raderna Ja, Nej, Svar, Kommentar, Ingen fil bifogad, Antal och "
        "Pris/… är fält som "
        'leverantören fyller i, och punkten "Leverantören bekräftar att ovanstående krav uppfylls." är '
        "svarsfältet för kravet ovanför: citera kravets egen text, aldrig fälten."
    )
}
"""What a layout means for reading the document, told to the model with the outline."""
_STOCKHOLM = ZoneInfo("Europe/Stockholm")

# What a notice's deadline is the last day for: tenders, or requests to participate
# (anbudsansökan), which is all a restricted procedure's notice gives (eForms BT-1311).
DeadlineKind = Literal["tender", "request"]
# What each kind is called, in the web app's words.
DEADLINE_LABELS: dict[DeadlineKind, str] = {
    "tender": "Sista anbudsdag",
    "request": "Sista dag för anbudsansökan",
}


def deadline_kind(value: object) -> DeadlineKind:
    """The kind of a stored deadline; anything but "request" is the usual tender deadline."""

    return "request" if value == "request" else "tender"


class NoticeContext(ContractModel):
    """What the model needs to know about a procurement notice."""

    notice_id: str
    title: str
    buyer: str | None = None
    description: str | None = None
    cpv_codes: list[str] = Field(default_factory=list)
    cpv_labels: dict[str, str] = Field(
        default_factory=dict, description="Swedish labels of the CPV codes that have one, by code."
    )
    procedure: str | None = None
    deadline_at: datetime | None = None
    deadline_kind: DeadlineKind = Field(
        default="tender",
        description="tender: sista anbudsdag. request: sista dag för anbudsansökan (selektivt förfarande).",
    )
    question_deadline_at: datetime | None = Field(
        default=None, description="The last day for questions to the buyer, as the source states it."
    )
    url: str | None = None


class PagedDocument(ContractModel):
    """A document as extracted text, one entry per physical page (page 1 first)."""

    document_id: str | None = None
    filename: str
    pages: list[str]
    layout: str | None = Field(
        default=None,
        description="How the document was produced, when it matters for reading it (LAYOUT_NOTES).",
    )

    def render(self) -> str:
        """Render with explicit page markers that prompts tell the model to cite.

        A page without text says so, so the model never takes a scanned page for a blank one.
        """

        blocks = [
            f"{PAGE_MARKER.format(page=index)}\n{text.strip() or EMPTY_PAGE_TEXT}"
            for index, text in enumerate(self.pages, start=1)
        ]
        return f"DOKUMENT: {self.filename}\n\n" + "\n\n".join(blocks)

    @property
    def page_count(self) -> int:
        return len(self.pages)


class DocumentOutline(ContractModel):
    """One document of a set: what it is and how much of it the engine was given."""

    document_id: str | None = None
    filename: str
    page_count: int
    pages_included: int
    layout: str | None = None


class DocumentSet(ContractModel):
    """The documents of a procurement as one piece of material, the main document first.

    Built by `anbudsklar.documents.bundle`: every page when they fit the budget, otherwise a
    choice, with the pages left out saying so in place. The outline lets the model see what
    it did not read.
    """

    documents: list[PagedDocument]
    outline: list[DocumentOutline]
    unread_files: list[str] = Field(
        default_factory=list,
        description="Files the source lists for the procurement that could not be read in, by name.",
    )

    @classmethod
    def of(cls, documents: list[PagedDocument], unread_files: Sequence[str] = ()) -> DocumentSet:
        """A set with every page of every document, for engines and tests."""

        return cls(
            documents=documents,
            outline=[
                DocumentOutline(
                    document_id=document.document_id,
                    filename=document.filename,
                    page_count=document.page_count,
                    pages_included=document.page_count,
                    layout=document.layout,
                )
                for document in documents
            ],
            unread_files=list(unread_files),
        )

    @property
    def is_complete(self) -> bool:
        return all(item.pages_included == item.page_count for item in self.outline)

    def render(self) -> str:
        """The outline, then each document with its own DOKUMENT: line and page markers."""

        count = len(self.documents)
        lines = [
            f"Underlaget består av {count} dokument. Det första är huvuddokumentet."
            if count > 1
            else "Underlaget består av ett dokument."
        ]
        if not self.is_complete:
            lines.append('Sidor som inte är med står som "(sidan är inte med i urvalet)".')
        for index, item in enumerate(self.outline, start=1):
            included = "alla med" if item.pages_included == item.page_count else f"{item.pages_included} med"
            lines.append(f"{index}. {item.filename} – {item.page_count} sidor, {included}")
        for layout in dict.fromkeys(item.layout for item in self.outline if item.layout in LAYOUT_NOTES):
            named = [str(index) for index, item in enumerate(self.outline, start=1) if item.layout == layout]
            lines.append(f"Dokument {', '.join(named)}: {LAYOUT_NOTES[layout]}")
        if self.unread_files:
            lines.append(
                "Filer som hör till upphandlingen men inte kunde läsas in här, och därför inte är med: "
                + ", ".join(self.unread_files)
                + ". Säg att de finns hos köparen när frågan kan gälla dem."
            )
        return "\n".join(lines) + "\n\n" + "\n\n".join(document.render() for document in self.documents)


class PublishedAnswerInput(ContractModel):
    """A question a supplier asked in e-Avrop and the answer the buyer published (decisions 0013 and 0018).

    Public for every supplier, and never who asked. `number` is the answer's place in the
    notice's list, oldest first, as the web app numbers it; `key` is its stable key in the
    source, which only our code uses.
    """

    number: int = Field(ge=1)
    key: str
    question: str
    answer: str
    answered_at: datetime

    def render(self) -> str:
        local = self.answered_at.astimezone(_STOCKHOLM) if self.answered_at.tzinfo else self.answered_at
        day = local.date().isoformat()
        marker = ANSWER_MARKER.format(number=self.number)
        return f"{marker} besvarad {day}\nFråga: {self.question.strip()}\nSvar: {self.answer.strip()}"


def render_published_answers(answers: list[PublishedAnswerInput]) -> str:
    """The buyer's answers as one block of material, each behind its [SVAR n] marker."""

    if not answers:
        return ""
    lead = (
        "Inköp har publicerat de här svaren på leverantörernas frågor i e-Avrop. Svaren gäller alla "
        "leverantörer och hör till underlaget. Säger ett svar något annat än dokumenten gäller svaret."
    )
    return lead + "\n\n" + "\n\n".join(answer.render() for answer in answers)


class CompanyProfile(ContractModel):
    """A company's self-description, used for matching and CPV suggestions."""

    name: str
    description: str
    cpv_codes: list[str] = Field(default_factory=list)
    cpv_labels: dict[str, str] = Field(
        default_factory=dict, description="Swedish labels of the CPV codes that have one, by code."
    )
    municipalities: list[str] = Field(default_factory=list)
    employees: int | None = None
    annual_turnover_sek: int | None = None
    certifications: list[str] = Field(default_factory=list)
    insurance: str | None = None
    public_references: str | None = Field(
        default=None, description="Earlier assignments for public buyers, in the company's own words."
    )


class CpvCandidate(ContractModel):
    """A CPV code found by search that the model may choose from."""

    code: str
    label: str
