"""The committed fixtures: fictitious markings, facit quotes on their pages and a reproducible build."""

from __future__ import annotations

import csv
import hashlib
import importlib
import io
import json
import re
from datetime import date
from pathlib import Path
from typing import Any, get_args

import pytest
from pypdf import PdfReader

from anbudsklar.contracts.tasks import CheckStatus, DateKind, RequirementKind
from anbudsklar.documents.citations import locate_quote
from anbudsklar.documents.extract import extract_pages

FIXTURES = Path(__file__).resolve().parents[3] / "data" / "fixtures"
FOOTER = "FIKTIVT UNDERLAG – endast för demonstration"
MANIFEST: dict[str, Any] = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
REFERENCE = date.fromisoformat(MANIFEST["reference_date"])
DOCUMENTS = [document for notice in MANIFEST["notices"] for document in notice["documents"]]
DRAFT = MANIFEST["tender_drafts"][0]
ALL_PDFS = [*DOCUMENTS, DRAFT]
GENERATED_FILES = [
    "manifest.json",
    "agreements.csv",
    *(document["path"] for document in ALL_PDFS),
    *(document["facit"] for document in DOCUMENTS),
    DRAFT["expected_review"],
]


def _pdf_pages(path: str) -> list[str]:
    reader = PdfReader(io.BytesIO((FIXTURES / path).read_bytes()))
    return [page.extract_text() for page in reader.pages]


def _squash(text: str) -> str:
    return " ".join(text.split())


def _facit(document: dict[str, Any]) -> list[dict[str, Any]]:
    return json.loads((FIXTURES / document["facit"]).read_text(encoding="utf-8"))


def _by_path(documents: list[dict[str, Any]]) -> dict[str, Any]:
    return {"argvalues": documents, "ids": [document["path"] for document in documents]}


@pytest.mark.parametrize("document", **_by_path(ALL_PDFS))
def test_pdf_matches_manifest(document: dict[str, Any]) -> None:
    data = (FIXTURES / document["path"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == document["sha256"]
    assert len(PdfReader(io.BytesIO(data)).pages) == document["page_count"]


@pytest.mark.parametrize("document", **_by_path(ALL_PDFS))
def test_every_page_is_marked_fictitious(document: dict[str, Any]) -> None:
    pages = _pdf_pages(document["path"])
    assert all(FOOTER in _squash(page) for page in pages)
    assert "fiktiv" in _squash(pages[0]).lower()


def test_page_counts_follow_the_brief() -> None:
    pages = {document["path"].split("/")[0]: document["page_count"] for document in DOCUMENTS}
    assert 14 <= pages["ommalning-solbacken"] <= 18
    assert 8 <= pages["stadtjanster-forskolor"] <= 12
    assert 6 <= pages["frukt-och-gront"] <= 10


@pytest.mark.parametrize("document", **_by_path(DOCUMENTS))
def test_facit_items_are_well_formed(document: dict[str, Any]) -> None:
    items = _facit(document)
    assert len(items) == document["facit_items"]
    assert [item["id"] for item in items] == [f"K{n:02d}" for n in range(1, len(items) + 1)]
    for item in items:
        assert set(item) == {"id", "kind", "page", "quote_fragment", "title"}
        assert item["kind"] in get_args(RequirementKind)
        assert 1 <= item["page"] <= document["page_count"]
        assert item["title"] and len(item["quote_fragment"]) >= 10


@pytest.mark.parametrize("document", **_by_path(DOCUMENTS))
def test_facit_quotes_are_verbatim_on_their_pages(document: dict[str, Any]) -> None:
    pages = [_squash(page) for page in _pdf_pages(document["path"])]
    missing = [
        item["id"] for item in _facit(document) if item["quote_fragment"] not in pages[item["page"] - 1]
    ]
    assert missing == []


@pytest.mark.parametrize("document", **_by_path(DOCUMENTS))
def test_facit_quotes_verify_with_the_citation_checker(document: dict[str, Any]) -> None:
    data = (FIXTURES / document["path"]).read_bytes()
    pages = extract_pages(data, document["mimetype"], document["filename"])
    results = {
        item["id"]: locate_quote(item["quote_fragment"], pages, item["page"]) for item in _facit(document)
    }
    assert {key: value for key, value in results.items() if value[0] != "verified"} == {}


def test_lou_references_in_documents_are_the_verified_ones() -> None:
    """Guards against new, unchecked references: every cited section was checked against SFS 2016:1145."""

    checked = {
        "4 kap. 14 §", "6 kap. 2 §", "7 kap. 1 §", "7 kap. 2 §", "7 kap. 4 §", "12 kap. 12 §",
        "13 kap. 1 §", "13 kap. 2 §", "13 kap. 3 §", "14 kap. 2 §", "14 kap. 3 §", "14 kap. 5 §",
        "15 kap. 1 §", "16 kap. 1 §", "16 kap. 6 §", "17 kap. 2 §", "17 kap. 17 §", "19 kap. 2 §",
        "19 kap. 4 §", "19 kap. 5 §", "19 kap. 9 §", "19 kap. 13 §", "19 kap. 16 §", "19 kap. 17 §",
        "19 kap. 18 §", "19 kap. 19 §", "19 kap. 21 §", "20 kap. 1 §",
    }  # fmt: skip
    pattern = re.compile(r"\b(\d+) kap\. (\d+) §")
    cited = {
        f"{chapter} kap. {section} §"
        for document in ALL_PDFS
        for page in _pdf_pages(document["path"])
        for chapter, section in pattern.findall(_squash(page))
    }
    assert cited <= checked


def test_procedures_use_current_lou_terminology() -> None:
    """Förenklat förfarande and urvalsförfarande left LOU on 1 February 2022 (SFS 2021:1110).

    A document may still name the old procedure for readers who know it, but only as what the
    procedure used to be called, never as the procedure of the notice.
    """

    removed = ("förenklat förfarande", "urvalsförfarande")
    for notice in MANIFEST["notices"]:
        assert not any(term in notice["procedure"].lower() for term in removed), notice["external_id"]
    for document in ALL_PDFS:
        for page_no, page in enumerate(_pdf_pages(document["path"]), start=1):
            text = _squash(page).lower()
            for term in removed:
                for match in re.finditer(term, text):
                    context = text[max(0, match.start() - 40) : match.start()]
                    assert "tidigare kallades" in context, f"{document['path']} page {page_no}: {term}"


def test_key_dates_use_checklist_date_kinds() -> None:
    for notice in MANIFEST["notices"]:
        kinds = {key_date["kind"] for key_date in notice["key_dates"]}
        assert kinds <= set(get_args(DateKind))
        assert {"fragestopp", "sista_anbudsdag", "anbudets_giltighet"} <= kinds
        deadline = next(key for key in notice["key_dates"] if key["kind"] == "sista_anbudsdag")
        assert deadline["offset_days"] == notice["deadline"]["offset_days"] > 0


def test_tender_draft_has_the_deliberate_gaps() -> None:
    review = json.loads((FIXTURES / DRAFT["expected_review"]).read_text(encoding="utf-8"))
    facit = {item["id"]: item for item in _facit(DOCUMENTS[0])}
    draft_pages = [_squash(page) for page in _pdf_pages(DRAFT["path"])]
    statuses = {facit[check["requirement_id"]]["title"]: check["status"] for check in review["checks"]}

    assert statuses["Ansvarsförsäkring minst 5 miljoner kronor med försäkringsbevis"] == "obevisat"
    assert statuses["Två referensuppdrag i offentlig miljö de senaste tre åren"] == "saknas"
    assert statuses["Priser i SEK exklusive moms i prisbilagan"] == "uppfyllt"
    assert all(check["status"] in get_args(CheckStatus) for check in review["checks"])
    for check in review["checks"]:
        if "draft_quote" in check:
            assert check["draft_quote"] in draft_pages[check["draft_page"] - 1]
    whole_draft = " ".join(draft_pages)
    assert "Referensblankett" not in whole_draft
    assert "Bilaga 4" not in whole_draft
    assert "742 000 kronor" in whole_draft and "exklusive mervärdesskatt" in whole_draft


def test_agreements_cover_the_upcoming_window() -> None:
    with (FIXTURES / "agreements.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert list(rows[0]) == [
        "external_id", "title", "category", "cpv_codes", "supplier", "start_date", "end_date",
        "extension_months", "max_end_date", "previous_requirements",
    ]  # fmt: skip
    assert len(rows) >= 25
    days_left = {row["title"]: (date.fromisoformat(row["end_date"]) - REFERENCE).days for row in rows}
    assert 395 <= days_left["Ramavtal måleriarbeten"] <= 456  # about 14 months
    assert any(title.startswith("Livsmedel") and 269 <= days <= 360 for title, days in days_left.items())
    assert sum(182 <= days <= 548 for days in days_left.values()) >= 8  # 6 to 18 months
    assert all("(fiktiv)" in row["supplier"] for row in rows)


def _luhn_valid(number: str) -> bool:
    digits = [int(char) for char in number if char.isdigit()]
    total = sum(sum(divmod(digit * (2 - index % 2), 10)) for index, digit in enumerate(digits))
    return total % 10 == 0


def test_companies_are_fictitious_and_match_the_personas() -> None:
    companies = json.loads((FIXTURES / "companies.json").read_text(encoding="utf-8"))
    by_org_number = {company["org_number"]: company for company in companies}
    painter = next(company for company in companies if company["name"] == "Målerifirman i Matfors AB")

    assert len(companies) == 2 and all(company["is_fictitious"] for company in companies)
    # An invalid check digit guarantees the number cannot belong to a real company.
    assert not any(_luhn_valid(number) for number in by_org_number)
    assert painter["employees"] == 5 and painter["municipalities"] == ["Sundsvall", "Timrå"]
    for persona in MANIFEST["personas"]:
        assert persona["email"].endswith(".example")
        assert persona["company_org_number"] in (None, *by_org_number)
    assert {persona["role"] for persona in MANIFEST["personas"]} == {"foretagare", "inkopare"}


def test_build_is_reproducible(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("fpdf")
    monkeypatch.syspath_prepend(str(FIXTURES))
    build_fixtures = importlib.import_module("build_fixtures")

    build_fixtures.main(["--output", str(tmp_path), "--reference-date", REFERENCE.isoformat()])

    changed = [
        path for path in GENERATED_FILES if (tmp_path / path).read_bytes() != (FIXTURES / path).read_bytes()
    ]
    assert changed == [], "Run `uv run python ../data/fixtures/build_fixtures.py` and commit the result"
