"""The document set a question is answered from: everything when it fits, a chosen part when not."""

from __future__ import annotations

from anbudsklar.contracts import PagedDocument
from anbudsklar.documents.bundle import (
    OMITTED_PAGE_TEXT,
    PageRef,
    build_document_set,
    filename_key,
    references_in,
)


def _document(document_id: str, filename: str, pages: list[str]) -> PagedDocument:
    return PagedDocument(document_id=document_id, filename=filename, pages=pages)


MAIN = _document(
    "main",
    "6.1 Administrativa föreskrifter.pdf",
    [
        "Anbud ska lämnas i e-Avrop. Anbudet ska vara på svenska.",
        "Krav på entreprenören framgår av bilaga 6.6. Priser lämnas i 6.5 Prisformulär.",
        "Avtalsvillkoren finns i bilaga 01.",
    ],
)
REQUIREMENTS = _document(
    "req",
    "6.6 Krav på Entreprenör.pdf",
    ["Entreprenören ska ha ansvarsförsäkring.", "Referenser ska lämnas."],
)
PRICES = _document("prices", "6.5 Prisformulär.pdf", ["Pris per timme."])
CONTRACT = _document("contract", "01 Ramavtalsutkast.pdf", ["§ 1 Parter.", "§ 2 Avtalstid.", "§ 3 Priser."])
DOCUMENTS = [MAIN, REQUIREMENTS, PRICES, CONTRACT]


def test_references_and_filename_keys() -> None:
    assert references_in("Krav på entreprenören framgår av bilaga 6.6, se även 6.2.1 och bil. 2.") == {
        "6.6",
        "6.2.1",
        "2",
    }
    assert references_in("Avtalet gäller från 2026-11-01 i 24 månader.") == set()
    assert filename_key("6.6 Krav på Entreprenör.pdf") == "6.6"
    assert filename_key("Bilaga 1 Prisbilaga.xlsx") == "1"
    assert filename_key("Förfrågan - Utbildning.pdf") is None


def test_everything_fits_in_the_budget() -> None:
    document_set = build_document_set(DOCUMENTS, budget_chars=10_000)

    assert document_set.is_complete
    assert [item.filename for item in document_set.outline] == [document.filename for document in DOCUMENTS]
    assert document_set.documents[1].pages == REQUIREMENTS.pages
    rendered = document_set.render()
    assert rendered.startswith("Underlaget består av 4 dokument. Det första är huvuddokumentet.")
    assert "1. 6.1 Administrativa föreskrifter.pdf – 3 sidor, alla med" in rendered
    assert rendered.count("DOKUMENT: ") == 4


def test_over_budget_the_main_document_and_its_referenced_attachments_come_first() -> None:
    # Room for the main document, the referenced requirements and prices, but not the contract.
    budget = sum(len(page) for page in MAIN.pages + REQUIREMENTS.pages + PRICES.pages) + 10
    hits = [PageRef("contract", 3), PageRef("main", 2)]

    document_set = build_document_set(DOCUMENTS, hits=hits, budget_chars=budget)

    included = {item.filename: item.pages_included for item in document_set.outline}
    assert included == {
        MAIN.filename: 3,
        REQUIREMENTS.filename: 2,
        PRICES.filename: 1,
        CONTRACT.filename: 0,
    }
    assert not document_set.is_complete
    contract = document_set.documents[3]
    assert contract.pages == [OMITTED_PAGE_TEXT] * 3  # numbering kept, the pages say they are left out
    assert "4. 01 Ramavtalsutkast.pdf – 3 sidor, 0 med" in document_set.render()
    assert '"(sidan är inte med i urvalet)"' in document_set.render()


def test_over_budget_search_hits_fill_what_is_left() -> None:
    # Room for the main document and two more pages; no references in the hit page of the main document.
    budget = sum(len(page) for page in MAIN.pages) + len(CONTRACT.pages[2]) + len(REQUIREMENTS.pages[1]) + 2
    hits = [PageRef("main", 1), PageRef("contract", 3), PageRef("req", 2), PageRef("prices", 1)]

    document_set = build_document_set(DOCUMENTS, hits=hits, budget_chars=budget)

    chosen = {
        item.filename: [
            page_no
            for page_no, text in enumerate(document_set.documents[index].pages, start=1)
            if text != OMITTED_PAGE_TEXT
        ]
        for index, item in enumerate(document_set.outline)
    }
    assert chosen[MAIN.filename] == [1, 2, 3]
    assert chosen[CONTRACT.filename] == [3]
    assert chosen[REQUIREMENTS.filename] == [2]
    assert chosen[PRICES.filename] == []


def test_a_main_document_larger_than_the_budget_is_cut_but_numbered() -> None:
    document_set = build_document_set(DOCUMENTS, budget_chars=len(MAIN.pages[0]) + len(MAIN.pages[1]))

    main = document_set.documents[0]
    assert main.pages[:2] == MAIN.pages[:2]
    assert main.pages[2] == OMITTED_PAGE_TEXT
    assert document_set.outline[0].pages_included == 2
    assert all(item.pages_included == 0 for item in document_set.outline[1:])


def test_no_documents() -> None:
    assert build_document_set([]).documents == []
