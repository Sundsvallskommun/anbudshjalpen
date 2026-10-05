"""The quality test runner on a tiny fictitious fixture."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from anbudsklar.ai.engine import EngineError
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.eval import EvalError, run_eval
from anbudsklar.eval.cli import main
from anbudsklar.eval.runner import discover_fixtures, evaluate_fixture, load_fixture

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "data" / "eval"


@pytest.fixture
def fixtures(tmp_path: Path) -> Path:
    root = tmp_path / "fixtures"
    target = root / "exempel"
    target.mkdir(parents=True)
    for name in ("facit.json", "forfragningsunderlag.pdf"):
        shutil.copy(FIXTURE_DIR / name, target / name)
    return root


async def test_heuristic_baseline_finds_every_facit_item(fixtures: Path, tmp_path: Path) -> None:
    out = tmp_path / "reports"
    report = await run_eval("heuristic", fixtures, out)

    totals = report.totals
    assert (totals.facit_total, totals.matched, totals.extracted_total) == (5, 5, 6)
    assert totals.recall == 1.0
    assert totals.precision == pytest.approx(5 / 6)
    assert totals.citation_rate == 1.0
    document = report.documents[0]
    assert (document.fixture, document.document, document.page_count) == (
        "exempel",
        "forfragningsunderlag.pdf",
        3,
    )
    # "Försäkringsbevis ska bifogas anbudet." is folded into the insurance requirement.
    assert [extra.title for extra in document.extra] == ["Anbud ska ha kommit in senast den 2 november 2026"]

    stem = f"eval-heuristic-{report.created_at:%Y-%m-%d}"
    markdown = (out / f"{stem}.md").read_text(encoding="utf-8")
    assert markdown.startswith("# Kvalitetstest: tolka underlag")
    assert "| Täckning (recall) | 100 % (5 av 5 krav i facit) |" in markdown
    data = json.loads((out / f"{stem}.json").read_text(encoding="utf-8"))
    assert data["totals"]["recall"] == 1.0
    assert data["documents"][0]["items"][0]["citation_check"] == "verified"


class FailingEngine(HeuristicEngine):
    async def interpret_document(self, notice, document):  # type: ignore[override]
        raise EngineError("Språkmodellen svarar inte just nu.")


async def test_engine_failures_count_as_missed_requirements(fixtures: Path) -> None:
    fixture = discover_fixtures(fixtures)[0]
    report = await evaluate_fixture(FailingEngine(), fixture)
    assert report.error == "Språkmodellen svarar inte just nu."
    assert (report.scores.facit_total, report.scores.matched, report.scores.recall) == (5, 0, 0.0)


def test_facit_object_names_its_document(tmp_path: Path) -> None:
    shutil.copy(FIXTURE_DIR / "forfragningsunderlag.pdf", tmp_path / "a.pdf")
    shutil.copy(FIXTURE_DIR / "forfragningsunderlag.pdf", tmp_path / "anbudsutkast.pdf")
    items = json.loads((FIXTURE_DIR / "facit.json").read_text(encoding="utf-8"))
    (tmp_path / "facit.json").write_text(json.dumps({"document": "a.pdf", "items": items}), encoding="utf-8")
    fixture = load_fixture(tmp_path / "facit.json", tmp_path)
    assert (fixture.name, fixture.document.name, len(fixture.items)) == (".", "a.pdf", 5)


def test_ambiguous_or_missing_fixtures_are_reported(tmp_path: Path) -> None:
    with pytest.raises(EvalError, match=r"Hittade ingen facit\.json"):
        discover_fixtures(tmp_path)
    for name in ("a.pdf", "b.pdf"):
        shutil.copy(FIXTURE_DIR / "forfragningsunderlag.pdf", tmp_path / name)
    shutil.copy(FIXTURE_DIR / "facit.json", tmp_path / "facit.json")
    with pytest.raises(EvalError, match="2 möjliga dokument"):
        discover_fixtures(tmp_path)


def test_tender_drafts_are_not_mistaken_for_the_document(fixtures: Path) -> None:
    shutil.copy(FIXTURE_DIR / "forfragningsunderlag.pdf", fixtures / "exempel" / "anbudsutkast.pdf")
    assert discover_fixtures(fixtures)[0].document.name == "forfragningsunderlag.pdf"


def test_cli_prints_a_summary(fixtures: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["--engine", "heuristic", "--fixtures", str(fixtures), "--out", str(tmp_path / "out")])
    assert code == 0
    output = capsys.readouterr().out
    assert "Täckning: 100 % (5 av 5 krav)" in output
    assert "Rapport:" in output
    assert (
        main(["--engine", "heuristic", "--fixtures", str(tmp_path / "saknas"), "--out", str(tmp_path)]) == 1
    )
