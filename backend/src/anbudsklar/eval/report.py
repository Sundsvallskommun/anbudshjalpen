"""The quality test report: JSON for comparisons over time, Markdown for people.

The Markdown is Swedish because verksamheten reads it to judge whether the checklists
are good enough to show companies.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

from anbudsklar.contracts import CitationCheck
from anbudsklar.eval.scoring import ItemMatch, MatchBasis, Scores

_CHECK_LABELS: dict[str, str] = {
    "verified": "verifierad",
    "moved": "på annan sida",
    "unverified": "kunde inte kontrolleras",
}


class ItemReport(BaseModel):
    """A facit item and what the engine extracted for it."""

    facit_id: str
    kind: str
    page: int
    title: str
    found: bool
    requirement_id: str | None = None
    requirement_title: str | None = None
    requirement_kind: str | None = None
    score: float | None = None
    basis: MatchBasis | None = None
    citation_check: CitationCheck | None = None

    @classmethod
    def from_match(cls, match: ItemMatch) -> ItemReport:
        item, requirement = match.facit, match.requirement
        return cls(
            facit_id=item.id,
            kind=item.kind,
            page=item.page,
            title=item.title,
            found=requirement is not None,
            requirement_id=requirement.id if requirement else None,
            requirement_title=requirement.title if requirement else None,
            requirement_kind=requirement.kind if requirement else None,
            score=round(match.score, 1) if requirement else None,
            basis=match.basis,
            citation_check=requirement.citation.check if requirement else None,
        )


class ExtraRequirement(BaseModel):
    """An extracted requirement that matched no facit item."""

    requirement_id: str
    title: str
    page: int
    citation_check: CitationCheck | None = None


class DocumentReport(BaseModel):
    fixture: str
    document: str
    page_count: int = 0
    seconds: float = 0.0
    model: str | None = None
    attempts: int | None = None
    error: str | None = None
    scores: Scores = Field(default_factory=Scores)
    items: list[ItemReport] = Field(default_factory=list)
    extra: list[ExtraRequirement] = Field(default_factory=list)


class EvalReport(BaseModel):
    """Result of one quality test run over all fixtures with a facit."""

    engine: str
    model: str | None = None
    created_at: datetime
    fixtures_dir: str
    documents: list[DocumentReport]
    totals: Scores

    def to_markdown(self) -> str:
        return "\n".join(_markdown(self)) + "\n"


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def percent(rate: float | None) -> str:
    """A rate as a whole percentage, or a dash when it is undefined."""

    return "–" if rate is None else f"{rate * 100:.0f} %"


def _summary_rows(scores: Scores) -> list[str]:
    return [
        "| Mått | Värde |",
        "|---|---|",
        f"| Täckning (recall) | {percent(scores.recall)} "
        f"({scores.matched} av {scores.facit_total} krav i facit) |",
        f"| Precision | {percent(scores.precision)} "
        f"({scores.matched} av {scores.extracted_total} utplockade krav) |",
        f"| Rätt kravtyp | {percent(scores.kind_agreement)} av de matchade kraven |",
        f"| Verifierade citat | {percent(scores.citation_rate)} (verifierade {scores.citations_verified}, "
        f"på annan sida {scores.citations_moved}, kunde inte kontrolleras {scores.citations_unverified}) |",
    ]


def _document_rows(documents: list[DocumentReport]) -> list[str]:
    rows = [
        "| Underlag | Sidor | Täckning | Precision | Verifierade citat | Tid | Fel |",
        "|---|---|---|---|---|---|---|",
    ]
    for document in documents:
        scores = document.scores
        rows.append(
            f"| {_cell(document.fixture)} | {document.page_count} | {percent(scores.recall)} | "
            f"{percent(scores.precision)} | {percent(scores.citation_rate)} | {document.seconds:.1f} s | "
            f"{_cell(document.error or '')} |"
        )
    return rows


def _item_rows(document: DocumentReport) -> list[str]:
    rows = [
        "| Facit | Typ | Sida | Krav | Hittat som | Poäng | Grund | Citat |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for item in document.items:
        found = f"{item.requirement_id} ({item.requirement_kind})" if item.found else "**saknas**"
        check = _CHECK_LABELS.get(item.citation_check or "", "")
        score = f"{item.score:.0f}" if item.score is not None else ""
        rows.append(
            f"| {item.facit_id} | {item.kind} | {item.page} | {_cell(item.title)} | {found} | {score} | "
            f"{item.basis or ''} | {check} |"
        )
    return rows


def _markdown(report: EvalReport) -> list[str]:
    lines = [
        "# Kvalitetstest: tolka underlag",
        "",
        f"- Motor: {report.engine}" + (f" (modell: {report.model})" if report.model else ""),
        f"- Körd: {report.created_at:%Y-%m-%d %H:%M}",
        f"- Underlag: {len(report.documents)} från {report.fixtures_dir}",
        "",
        "## Sammanfattning",
        "",
        *_summary_rows(report.totals),
        "",
        "## Per underlag",
        "",
        *_document_rows(report.documents),
    ]
    for document in report.documents:
        lines += ["", f"## {document.fixture}", "", f"Dokument: {document.document}", ""]
        if document.error:
            lines += [f"Motorn misslyckades: {document.error}"]
            continue
        lines += _item_rows(document)
        if document.extra:
            lines += ["", f"Utplockade krav som inte finns i facit ({len(document.extra)}):", ""]
            lines += [
                f"- {extra.requirement_id} (sida {extra.page}): {extra.title}" for extra in document.extra
            ]
    return lines


def report_paths(report: EvalReport, out_dir: Path) -> tuple[Path, Path]:
    """reports/eval-<engine>-<date>.md and .json (a later run the same day replaces them)."""

    stem = f"eval-{report.engine}-{report.created_at:%Y-%m-%d}"
    return out_dir / f"{stem}.md", out_dir / f"{stem}.json"


def write_report(report: EvalReport, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    markdown_path, json_path = report_paths(report, out_dir)
    markdown_path.write_text(report.to_markdown(), encoding="utf-8")
    json_path.write_text(report.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return markdown_path, json_path
