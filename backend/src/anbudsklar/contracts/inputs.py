"""Inputs shared by several AI tasks.

These mirror what an Eneo Flow run would receive as form fields and runtime files.
Documents are always passed as text per page so that every engine cites the same page
numbers that our citation verification checks against.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from anbudsklar.contracts.common import ContractModel

PAGE_MARKER = "[SIDA {page}]"

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
    url: str | None = None


class PagedDocument(ContractModel):
    """A document as extracted text, one entry per physical page (page 1 first)."""

    document_id: str | None = None
    filename: str
    pages: list[str]

    def render(self) -> str:
        """Render with explicit page markers that prompts tell the model to cite."""

        blocks = [
            f"{PAGE_MARKER.format(page=index)}\n{text.strip()}"
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


class DocumentSet(ContractModel):
    """The documents of a procurement as one piece of material, the main document first.

    Built by `anbudsklar.documents.bundle`: every page when they fit the budget, otherwise a
    choice, with the pages left out saying so in place. The outline lets the model see what
    it did not read.
    """

    documents: list[PagedDocument]
    outline: list[DocumentOutline]

    @classmethod
    def of(cls, documents: list[PagedDocument]) -> DocumentSet:
        """A set with every page of every document, for engines and tests."""

        return cls(
            documents=documents,
            outline=[
                DocumentOutline(
                    document_id=document.document_id,
                    filename=document.filename,
                    page_count=document.page_count,
                    pages_included=document.page_count,
                )
                for document in documents
            ],
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
        return "\n".join(lines) + "\n\n" + "\n\n".join(document.render() for document in self.documents)


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
