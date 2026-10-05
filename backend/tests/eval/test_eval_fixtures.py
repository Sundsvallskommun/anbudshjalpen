"""The heuristic baseline on the repository's own fictitious fixtures (data/fixtures).

These numbers are the baseline the language-model engines must beat (docs/quality-test.md).
The thresholds guard against the heuristic sliding back into listing headings, buyer
duties and restatements as requirements.
"""

from __future__ import annotations

from pathlib import Path

from anbudsklar.eval import run_eval

FIXTURES = Path(__file__).resolve().parents[3] / "data" / "fixtures"
MIN_RECALL = 0.9
MIN_PRECISION = 0.85


async def test_heuristic_keeps_recall_and_precision_on_the_fixtures(tmp_path: Path) -> None:
    report = await run_eval("heuristic", FIXTURES, tmp_path)

    totals = report.totals
    assert totals.facit_total > 100
    assert totals.recall is not None and totals.recall >= MIN_RECALL
    assert totals.precision is not None and totals.precision >= MIN_PRECISION
    assert totals.citation_rate == 1.0
    for document in report.documents:
        assert document.error is None
        assert document.scores.recall is not None and document.scores.recall >= MIN_RECALL, document.fixture
