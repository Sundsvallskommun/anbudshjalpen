"""What the heuristic engine reads from the fictitious fixture documents.

The fixtures are the documents in data/fixtures; the expected values are what their
schedules ("Tidsplan"), contract terms and qualification requirements say.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pytest

from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.contracts import (
    Checklist,
    CompanyProfile,
    DocumentSet,
    MatchAssessment,
    MatchReason,
    NoticeContext,
    PagedDocument,
)
from anbudsklar.documents.extract import extract_pages

FIXTURES = Path(__file__).resolve().parents[3] / "data" / "fixtures"
DOCUMENTS = {
    "solbacken": FIXTURES / "ommalning-solbacken" / "forfragningsunderlag-ommalning-solbackens-forskola.pdf",
    "stad": FIXTURES / "stadtjanster-forskolor" / "forfragningsunderlag-stadtjanster-forskolor.pdf",
    "frukt": FIXTURES / "frukt-och-gront" / "forfragningsunderlag-livsmedel-frukt-och-gront.pdf",
}
SINGLE_KINDS = ("fragestopp", "sista_anbudsdag", "anbudets_giltighet", "tilldelning", "avtalsstart")


async def _checklist(name: str) -> Checklist:
    path = DOCUMENTS[name]
    pages = extract_pages(path.read_bytes(), "application/pdf", path.name)
    checklist, _ = await HeuristicEngine().interpret_document(
        NoticeContext(notice_id=name, title=name),
        DocumentSet.of([PagedDocument(filename=path.name, pages=pages)]),
    )
    return checklist


def _by_kind(checklist: Checklist) -> dict[str, list[dt.date | None]]:
    result: dict[str, list[dt.date | None]] = {}
    for item in checklist.dates:
        result.setdefault(item.kind, []).append(item.date)
    return result


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        (
            "solbacken",
            {
                "fragestopp": [dt.date(2026, 10, 30)],
                "sista_anbudsdag": [dt.date(2026, 11, 9)],
                "anbudets_giltighet": [dt.date(2027, 2, 7)],
                "tilldelning": [dt.date(2026, 11, 20)],
            },
        ),
        (
            "stad",
            {
                "fragestopp": [dt.date(2026, 10, 19)],
                "sista_anbudsdag": [dt.date(2026, 10, 29)],
                "anbudets_giltighet": [dt.date(2027, 3, 31)],
                "tilldelning": [dt.date(2026, 11, 19)],
                "avtalsstart": [dt.date(2027, 2, 1)],
            },
        ),
        (
            "frukt",
            {
                "fragestopp": [dt.date(2026, 10, 12)],
                "sista_anbudsdag": [dt.date(2026, 10, 22)],
                "anbudets_giltighet": [dt.date(2027, 1, 31)],
                "tilldelning": [dt.date(2026, 11, 5)],
                "avtalsstart": [dt.date(2027, 4, 1)],
            },
        ),
    ],
)
async def test_key_dates_match_the_schedule(name: str, expected: dict[str, list[dt.date]]) -> None:
    by_kind = _by_kind(await _checklist(name))
    assert {kind: by_kind.get(kind, []) for kind in SINGLE_KINDS} == {
        kind: expected.get(kind, []) for kind in SINGLE_KINDS
    }


async def test_buyer_answers_site_visit_and_contract_end_are_other_dates() -> None:
    solbacken = _by_kind(await _checklist("solbacken"))
    # The buyer's answers, the site-visit registration and the penalty clause's completion date.
    assert {dt.date(2026, 11, 3), dt.date(2026, 10, 13), dt.date(2027, 8, 13)} <= set(solbacken["annat"])
    stad = _by_kind(await _checklist("stad"))
    assert dt.date(2029, 1, 31) in stad["annat"]
    frukt = _by_kind(await _checklist("frukt"))
    assert dt.date(2029, 3, 31) in frukt["annat"]


async def test_procedure_uses_current_names() -> None:
    assert (await _checklist("solbacken")).procedure == "Annonserad upphandling under tröskelvärdena"
    assert (await _checklist("stad")).procedure == "Öppet förfarande"


# --- bedom_matchning against the Solbacken fixture -----------------------------------------

COMPANIES = json.loads((FIXTURES / "companies.json").read_text(encoding="utf-8"))
SOLBACKEN = NoticeContext(
    notice_id="solbacken",
    title="Ommålning av Solbackens förskola, Matfors",
    cpv_codes=["45442100", "45442110", "45442180"],
    cpv_labels={"45442100": "Målning", "45442110": "Målning av byggnader", "45442180": "Ommålning"},
)


def _painter(**changes: object) -> CompanyProfile:
    """Målerifirman i Matfors AB from data/fixtures/companies.json (fictitious)."""

    fields = {name: COMPANIES[0][name] for name in CompanyProfile.model_fields if name in COMPANIES[0]}
    return CompanyProfile.model_validate({**fields, **changes})


def _cited(assessment: MatchAssessment, topic: str) -> MatchReason:
    [reason] = [reason for reason in assessment.reasons if topic in reason.text]
    assert reason.citation is not None
    return reason


async def test_the_insurance_reason_cites_the_insurance_requirement_not_the_social_security_duty() -> None:
    checklist = await _checklist("solbacken")
    assessment, _ = await HeuristicEngine().assess_match(_painter(), SOLBACKEN, checklist)

    insurance = _cited(assessment, "försäkring")
    assert insurance.kind == "styrka"  # the profile states an insurance
    assert insurance.citation is not None and insurance.citation.page == 7
    # The first sentence under "3.4 Ansvarsförsäkring", not the F-skatt duty above it.
    assert insurance.citation.quote.startswith("Anbudsgivaren ska ha en ansvarsförsäkring som gäller")
    quotes = [reason.citation.quote for reason in assessment.reasons if reason.citation]
    assert not any("socialförsäkringsavgifter" in quote for quote in quotes)


async def test_reference_and_finance_reasons_cite_their_own_requirements() -> None:
    checklist = await _checklist("solbacken")
    profile = _painter(insurance=None, public_references=None, annual_turnover_sek=None)
    assessment, _ = await HeuristicEngine().assess_match(profile, SOLBACKEN, checklist)

    assert assessment.fit == "passar_delvis"  # what the profile leaves out must be checked
    insurance = _cited(assessment, "krav på försäkring")
    assert insurance.citation is not None and insurance.citation.page == 7
    # 3.5 Referensuppdrag: the requirement's own sentence never says "referens"; the folded
    # "Uppdragen ska redovisas i referensblanketten" does.
    references = _cited(assessment, "krav på referensuppdrag")
    assert references.kind == "oklart"
    assert references.citation is not None and references.citation.page == 8
    assert "två uppdrag med målning i offentlig miljö" in references.citation.quote
    finance = _cited(assessment, "krav på företagets ekonomi")
    assert finance.citation is not None and finance.citation.page == 7
    assert "stabil ekonomi" in finance.citation.quote
    assert finance.text == "Underlaget ställer krav på företagets ekonomi, men er profil säger inget om det."


async def test_the_fit_reasons_name_the_work_in_words() -> None:
    checklist = await _checklist("solbacken")
    assessment, _ = await HeuristicEngine().assess_match(_painter(), SOLBACKEN, checklist)
    assert assessment.reasons[0].text == "Upphandlingen gäller målning – det gör ni."
    assert not any(code in reason.text for reason in assessment.reasons for code in SOLBACKEN.cpv_codes)
    assert assessment.summary.startswith("Upphandlingen verkar passa er.")
