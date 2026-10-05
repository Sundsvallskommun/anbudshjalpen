"""Build Anbudsklar's fictitious procurement fixtures.

Writes, next to this script:

- one folder per procurement with the PDF and its facit.json (the true requirements),
- a fictitious tender draft for the first procurement with expected-review.json,
- agreements.csv (the fictitious agreement catalogue),
- manifest.json, which the seed (`anbudsklar.seed`) reads.

Everything is fictitious and every PDF page carries the footer
"FIKTIVT UNDERLAG – endast för demonstration". The output is reproducible: the same
reference date gives byte-identical files.

Run from backend/ (fpdf2 is in the dev dependency group):

    uv run python ../data/fixtures/build_fixtures.py [--reference-date 2026-10-05]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Sequence
from datetime import UTC, date, datetime, time
from pathlib import Path

from fixturegen import anbudsutkast, frukt_och_gront, ommalning, stadtjanster
from fixturegen.agreements import BASE_REFERENCE, write_agreements_csv
from fixturegen.blocks import Tracked
from fixturegen.dates import DateBook
from fixturegen.pdf import DocumentMeta, Rendered, render
from fixturegen.spec import NoticeSpec

FIXTURES_DIR = Path(__file__).resolve().parent
NOTICES: tuple[NoticeSpec, ...] = (ommalning.SPEC, stadtjanster.SPEC, frukt_och_gront.SPEC)
PDF_MIMETYPE = "application/pdf"
PUBLISHED_TIME = "08:00"
PERSONAS = (
    {
        "role": "foretagare",
        "name": "Anna Berg",
        "email": "anna.berg@malerifirman-matfors.example",
        "company_org_number": "559900-0013",
    },
    {
        "role": "inkopare",
        "name": "Lars Holm",
        "email": "lars.holm@inkop.kommun.example",
        "company_org_number": None,
    },
)


def main(argv: Sequence[str] | None = None) -> None:
    args = _parse_args(argv)
    reference: date = args.reference_date
    output: Path = args.output
    created = datetime.combine(reference, time(8, 0), tzinfo=UTC)

    notice_entries: list[dict[str, object]] = []
    rendered_by_slug: dict[str, Rendered] = {}
    for spec in NOTICES:
        dates = DateBook(reference, spec.key_dates)
        rendered = _render_notice(spec, dates, created)
        notice_entries.append(_write_notice(spec, dates, rendered, output))
        rendered_by_slug[spec.slug] = rendered

    draft_entry = _write_tender_draft(reference, created, rendered_by_slug[ommalning.SPEC.slug], output)
    agreement_rows = write_agreements_csv(output / "agreements.csv", reference)
    manifest = {
        "schema_version": 1,
        "reference_date": reference.isoformat(),
        "timezone": "Europe/Stockholm",
        "note": (
            "Alla upphandlingar, dokument, företag, personer och avtal är fiktiva och tagna fram för "
            "att demonstrera Anbudsklar. Datum anges som antal dagar från reference_date."
        ),
        "notices": notice_entries,
        "tender_drafts": [draft_entry],
        "agreements": {"path": "agreements.csv", "rows": agreement_rows},
        "companies": {"path": "companies.json"},
        "personas": list(PERSONAS),
    }
    _write_json(output / "manifest.json", manifest)
    _print_summary(notice_entries, draft_entry, agreement_rows)


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Anbudsklar's fictitious fixtures.")
    parser.add_argument(
        "--reference-date",
        type=date.fromisoformat,
        default=BASE_REFERENCE,
        help="Day the fixture dates are relative to (default: %(default)s).",
    )
    parser.add_argument("--output", type=Path, default=FIXTURES_DIR, help="Output directory.")
    return parser.parse_args(argv)


def _render_notice(spec: NoticeSpec, dates: DateBook, created: datetime) -> Rendered:
    meta = DocumentMeta(
        title=f"Förfrågningsunderlag: {spec.title} (fiktivt)",
        header_left=spec.header_left,
        header_right=spec.reference_number,
        created=created,
        with_toc=spec.with_toc,
    )
    return render(meta, spec.build_cover(dates), spec.build_blocks(dates))


def _write_notice(spec: NoticeSpec, dates: DateBook, rendered: Rendered, output: Path) -> dict[str, object]:
    folder = output / spec.slug
    folder.mkdir(parents=True, exist_ok=True)
    (folder / spec.filename).write_bytes(rendered.data)
    _write_json(folder / "facit.json", [item.to_json() for item in rendered.facit])
    return {
        "external_id": spec.external_id,
        "title": spec.title,
        "buyer": spec.buyer,
        "description": spec.description,
        "procedure": spec.procedure,
        "cpv_codes": list(spec.cpv_codes),
        "place": spec.place,
        "estimated_value_sek": spec.estimated_value_sek,
        "reference_number": spec.reference_number,
        "notice_type": "contract",
        "status": "open",
        "published": {"offset_days": _offset(spec, spec.published), "time": PUBLISHED_TIME},
        "deadline": {"offset_days": _offset(spec, spec.deadline), "time": spec.deadline_time},
        "key_dates": [
            {
                "name": key_date.name,
                "kind": key_date.kind,
                "label": key_date.label,
                "offset_days": key_date.offset_days,
                "date": dates.iso(key_date.name),
            }
            for key_date in spec.key_dates
        ],
        "documents": [
            {
                "path": f"{spec.slug}/{spec.filename}",
                "filename": spec.filename,
                "mimetype": PDF_MIMETYPE,
                "page_count": rendered.page_count,
                "sha256": hashlib.sha256(rendered.data).hexdigest(),
                "facit": f"{spec.slug}/facit.json",
                "facit_items": len(rendered.facit),
            }
        ],
    }


def _offset(spec: NoticeSpec, name: str) -> int:
    return next(key_date.offset_days for key_date in spec.key_dates if key_date.name == name)


def _write_tender_draft(
    reference: date, created: datetime, document: Rendered, output: Path
) -> dict[str, object]:
    """Render the draft and the review result expected against `document` (fixture 1)."""

    dates = DateBook(reference, anbudsutkast.KEY_DATES)
    blocks = anbudsutkast.build_blocks(dates)
    meta = DocumentMeta(
        title=f"Anbudsutkast: {ommalning.TITLE} (fiktivt)",
        header_left=f"{anbudsutkast.COMPANY} – anbud {ommalning.REFERENCE}",
        header_right="Utkast",
        created=created,
        with_toc=False,
    )
    rendered = render(meta, anbudsutkast.build_cover(dates), blocks)
    folder = output / anbudsutkast.SLUG
    folder.mkdir(parents=True, exist_ok=True)
    (folder / anbudsutkast.FILENAME).write_bytes(rendered.data)

    tracked_text = {block.key: block.text for block in blocks if isinstance(block, Tracked)}
    facit_titles = {item.id: item.title for item in document.facit}
    checks = []
    for expected in anbudsutkast.EXPECTED_CHECKS:
        requirement_id = document.facit_ids_by_key[expected.requirement_key]
        check: dict[str, object] = {
            "requirement_id": requirement_id,
            "requirement_title": facit_titles[requirement_id],
            "status": expected.status,
            "comment": expected.comment,
        }
        if expected.has_draft_quote:
            check["draft_quote"] = tracked_text[expected.requirement_key]
            check["draft_page"] = rendered.tracked_pages[expected.requirement_key]
        checks.append(check)
    expected_review = {
        "notice_external_id": ommalning.SPEC.external_id,
        "document_facit": f"{ommalning.SPEC.slug}/facit.json",
        "draft": f"{anbudsutkast.SLUG}/{anbudsutkast.FILENAME}",
        "scope": "De krav som utkastet är gjort för att pröva, inte samtliga krav i facit.",
        "checks": checks,
        "attachments": [
            {"name": name, "status": status} for name, status in anbudsutkast.EXPECTED_ATTACHMENTS
        ],
    }
    _write_json(folder / "expected-review.json", expected_review)
    return {
        "path": f"{anbudsutkast.SLUG}/{anbudsutkast.FILENAME}",
        "filename": anbudsutkast.FILENAME,
        "mimetype": PDF_MIMETYPE,
        "page_count": rendered.page_count,
        "sha256": hashlib.sha256(rendered.data).hexdigest(),
        "notice_external_id": ommalning.SPEC.external_id,
        "expected_review": f"{anbudsutkast.SLUG}/expected-review.json",
    }


def _write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _print_summary(notices: list[dict[str, object]], draft: dict[str, object], agreement_rows: int) -> None:
    for notice in notices:
        documents = notice["documents"]
        assert isinstance(documents, list)
        for document in documents:
            print(
                f"{document['path']}: {document['page_count']} sidor, {document['facit_items']} krav i facit"
            )
    print(f"{draft['path']}: {draft['page_count']} sidor")
    print(f"agreements.csv: {agreement_rows} avtal")


if __name__ == "__main__":
    main()
