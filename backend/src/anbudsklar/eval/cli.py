"""Command line for the quality test: `python -m anbudsklar.eval` (and `anbudsklar eval`)."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from anbudsklar.ai.engine import EngineError
from anbudsklar.config import get_settings
from anbudsklar.eval.report import EvalReport, percent, report_paths
from anbudsklar.eval.runner import EvalError, run_eval


def summary_lines(report: EvalReport, out_dir: Path) -> list[str]:
    """A short Swedish summary for the terminal."""

    totals = report.totals
    markdown_path, json_path = report_paths(report, out_dir)
    failed = [document.fixture for document in report.documents if document.error]
    lines = [
        f"Motor: {report.engine}" + (f" ({report.model})" if report.model else ""),
        f"Täckning: {percent(totals.recall)} ({totals.matched} av {totals.facit_total} krav)",
        f"Precision: {percent(totals.precision)} ({totals.matched} av {totals.extracted_total} utplockade)",
        f"Verifierade citat: {percent(totals.citation_rate)} av {totals.citations_total}",
        f"Rapport: {markdown_path}",
        f"Data: {json_path}",
    ]
    if failed:
        lines.append(f"Misslyckades: {', '.join(failed)}")
    return lines


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(
        prog="python -m anbudsklar.eval",
        description="Kvalitetstest av uppgiften tolka underlag mot facit i fixtures.",
    )
    parser.add_argument("--engine", default=settings.ai_engine, choices=["heuristic", "openai", "eneo"])
    parser.add_argument("--fixtures", type=Path, default=settings.data_dir / "fixtures")
    parser.add_argument("--out", type=Path, default=settings.data_dir.parent / "reports")
    args = parser.parse_args(argv)
    try:
        report = asyncio.run(run_eval(args.engine, args.fixtures, args.out))
    except (EvalError, EngineError) as error:
        print(f"Fel: {error}", file=sys.stderr)
        return 1
    print("\n".join(summary_lines(report, args.out)))
    return 0
