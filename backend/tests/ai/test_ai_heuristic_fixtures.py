"""Dates and procedure the heuristic engine reads from the fictitious fixture documents.

The fixtures are the documents in data/fixtures; the expected values are what their
schedules ("Tidsplan") and contract terms say.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest

from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.contracts import Checklist, NoticeContext, PagedDocument
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
        NoticeContext(notice_id=name, title=name), PagedDocument(filename=path.name, pages=pages)
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
