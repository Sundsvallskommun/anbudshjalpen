"""Run the quality test: interpret every fixture document that has a facit and score it.

A fixture is a directory with `facit.json` and the procurement document it describes.
The facit is either a list of items, with exactly one document in the directory (a
tender draft named "*utkast*" is ignored), or an object {"document": "<file>", "items":
[...]} when the directory holds several documents.

Engine failures are recorded per document and count as zero found requirements, so a
flaky engine shows up in the numbers instead of hiding behind an exception.
"""

from __future__ import annotations

import json
import mimetypes
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import TypeAdapter, ValidationError

from anbudsklar.ai.engine import AiEngine, EngineError, build_engine
from anbudsklar.contracts import DocumentSet, NoticeContext, PagedDocument
from anbudsklar.documents.citations import verify_checklist
from anbudsklar.documents.extract import DocumentError, extract_pages
from anbudsklar.eval.report import DocumentReport, EvalReport, ExtraRequirement, ItemReport, write_report
from anbudsklar.eval.scoring import FacitItem, Scores, combine, match_requirements, score_document

STOCKHOLM = ZoneInfo("Europe/Stockholm")
DOCUMENT_SUFFIXES = frozenset({".pdf", ".docx", ".txt", ".md"})
_FACIT_ITEMS = TypeAdapter(list[FacitItem])


class EvalError(RuntimeError):
    """The quality test cannot run (no fixtures, unreadable facit). Swedish message."""


@dataclass(frozen=True)
class Fixture:
    name: str
    document: Path
    items: list[FacitItem]


def _single_document(directory: Path) -> Path:
    documents = [
        path
        for path in sorted(directory.iterdir())
        if path.suffix.lower() in DOCUMENT_SUFFIXES and "utkast" not in path.name.lower()
    ]
    if len(documents) != 1:
        names = ", ".join(path.name for path in documents) or "inga"
        raise EvalError(
            f"{directory}: facit.json pekar inte ut något dokument och mappen har {len(documents)} "
            f'möjliga dokument ({names}). Ange {{"document": …, "items": […]}}.'
        )
    return documents[0]


def load_fixture(facit_path: Path, fixtures_dir: Path) -> Fixture:
    """Read one facit file and find the document it belongs to."""

    try:
        raw = json.loads(facit_path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            document = facit_path.parent / str(raw["document"])
            items = _FACIT_ITEMS.validate_python(raw["items"])
        else:
            document = _single_document(facit_path.parent)
            items = _FACIT_ITEMS.validate_python(raw)
    except (OSError, ValueError, KeyError, ValidationError) as error:
        raise EvalError(f"Kunde inte läsa {facit_path}: {error}") from error
    if not document.is_file():
        raise EvalError(f"{facit_path}: dokumentet {document.name} finns inte.")
    name = (
        facit_path.parent.relative_to(fixtures_dir).as_posix() if facit_path.parent != fixtures_dir else "."
    )
    return Fixture(name=name, document=document, items=items)


def discover_fixtures(fixtures_dir: Path) -> list[Fixture]:
    paths = sorted(fixtures_dir.rglob("facit.json"))
    if not paths:
        raise EvalError(f"Hittade ingen facit.json under {fixtures_dir}.")
    return [load_fixture(path, fixtures_dir) for path in paths]


def _read_pages(path: Path) -> list[str]:
    mimetype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return extract_pages(path.read_bytes(), mimetype, path.name)


async def evaluate_fixture(engine: AiEngine, fixture: Fixture) -> DocumentReport:
    """Interpret one document, verify the citations and score against the facit."""

    # Until scored, every facit item counts as missed: failures must lower recall.
    report = DocumentReport(
        fixture=fixture.name, document=fixture.document.name, scores=Scores(facit_total=len(fixture.items))
    )
    try:
        pages = _read_pages(fixture.document)
    except DocumentError as error:
        report.error = f"Kunde inte läsa dokumentet: {error}"
        return report
    report.page_count = len(pages)
    notice = NoticeContext(
        notice_id=fixture.name, title=fixture.document.stem.replace("-", " ").replace("_", " ")
    )
    document = PagedDocument(filename=fixture.document.name, pages=pages)
    started = time.perf_counter()
    try:
        checklist, run = await engine.interpret_document(notice, DocumentSet.of([document]))
    except EngineError as error:
        report.seconds = round(time.perf_counter() - started, 2)
        report.error = str(error)
        return report
    report.seconds = round(time.perf_counter() - started, 2)
    report.model, report.attempts = run.model, run.attempts

    verified, verification = verify_checklist(checklist, [document])
    matches = match_requirements(fixture.items, verified.requirements)
    report.scores = score_document(matches, verified.requirements, verification)
    report.items = [ItemReport.from_match(match) for match in matches]
    matched_ids = {match.requirement.id for match in matches if match.requirement}
    report.extra = [
        ExtraRequirement(
            requirement_id=requirement.id,
            title=requirement.title,
            page=requirement.citation.page,
            citation_check=requirement.citation.check,
        )
        for requirement in verified.requirements
        if requirement.id not in matched_ids
    ]
    return report


async def run_eval(engine_name: str, fixtures_dir: Path, out_dir: Path) -> EvalReport:
    """Run the quality test with one engine and write reports/eval-<engine>-<date>.{md,json}."""

    fixtures = discover_fixtures(fixtures_dir)
    engine = build_engine(engine_name)
    try:
        documents = [await evaluate_fixture(engine, fixture) for fixture in fixtures]
    finally:
        await engine.aclose()
    report = EvalReport(
        engine=engine.name,
        model=next((document.model for document in documents if document.model), None),
        created_at=datetime.now(STOCKHOLM),
        fixtures_dir=str(fixtures_dir),
        documents=documents,
        totals=combine([document.scores for document in documents]),
    )
    write_report(report, out_dir)
    return report
