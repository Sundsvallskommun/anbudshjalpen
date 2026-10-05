"""Searching and reading a notice's documents, and checking quotes against them."""

from __future__ import annotations

import uuid

from search_seed import Tender
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.search.queries import find_quote, read_pages, search_document
from anbudsklar.search.types import PageHit


def _pages(hits: list[PageHit], tender: Tender) -> list[tuple[str, int]]:
    names = {tender.main.id: "main", tender.annex.id: "annex"}
    return [(names.get(hit.document_id, "other"), hit.page_no) for hit in hits]


# --- search_document ------------------------------------------------------------------


async def test_full_text_hit_with_highlighted_snippet(db_session: AsyncSession, tender: Tender) -> None:
    [hit] = await search_document(db_session, tender.notice.id, "ansvarsförsäkring")
    assert (hit.document_id, hit.page_no, hit.section) == (tender.main.id, 2, "kvalificering")
    assert hit.filename == "Förfrågningsunderlag Solbacken.txt"
    assert "**ansvarsförsäkring**" in hit.snippet
    assert "\n" not in hit.snippet
    assert hit.rank > 0


async def test_search_covers_all_documents_of_the_notice_only(
    db_session: AsyncSession, tender: Tender
) -> None:
    hits = await search_document(db_session, tender.notice.id, "kronor")
    assert sorted(_pages(hits, tender)) == [("annex", 1), ("main", 2)]


async def test_section_filter(db_session: AsyncSession, tender: Tender) -> None:
    hits = await search_document(db_session, tender.notice.id, "kronor", sections=["prisbilaga"])
    assert _pages(hits, tender) == [("annex", 1)]
    hits = await search_document(db_session, tender.notice.id, "kronor", sections=["kvalificering"])
    assert _pages(hits, tender) == [("main", 2)]


async def test_page_range_filter(db_session: AsyncSession, tender: Tender) -> None:
    hits = await search_document(db_session, tender.notice.id, "kronor", first_page=2, last_page=3)
    assert _pages(hits, tender) == [("main", 2)]


async def test_question_in_plain_language_falls_back_to_any_word(
    db_session: AsyncSession, tender: Tender
) -> None:
    # No page has every word, so pages with any of them are returned ("ställs" is on page 1).
    hits = await search_document(db_session, tender.notice.id, "vilka försäkringskrav ställs på leverantören")
    by_page = dict(zip(_pages(hits, tender), hits, strict=True))
    assert set(by_page) == {("main", 1), ("main", 2)}
    assert "**Leverantören**" in by_page["main", 2].snippet


async def test_trigram_fallback_for_misspelled_words(db_session: AsyncSession, tender: Tender) -> None:
    [hit, *_] = await search_document(db_session, tender.notice.id, "ansvarsförsäkrng")
    assert (hit.document_id, hit.page_no) == (tender.main.id, 2)
    assert "**" in hit.snippet and "ansvarsförsäkring" in hit.snippet
    assert 0 < hit.rank <= 1


async def test_ranking_prefers_denser_matches(db_session: AsyncSession, tender: Tender) -> None:
    hits = await search_document(db_session, tender.notice.id, "målning or kvalitet")
    assert [hit.rank for hit in hits] == sorted((hit.rank for hit in hits), reverse=True)


async def test_empty_query_and_unknown_notice(db_session: AsyncSession, tender: Tender) -> None:
    assert await search_document(db_session, tender.notice.id, "   ") == []
    assert await search_document(db_session, uuid.uuid4(), "ansvarsförsäkring") == []


# --- read_pages -----------------------------------------------------------------------


async def test_read_pages_of_the_first_document(db_session: AsyncSession, tender: Tender) -> None:
    pages = await read_pages(db_session, tender.notice.id, 2, 3)
    assert [(page.document_id, page.page_no, page.section) for page in pages] == [
        (tender.main.id, 2, "kvalificering"),
        (tender.main.id, 3, "kravspecifikation"),
    ]
    assert pages[0].page_count == 4
    assert pages[0].text.startswith("2 Kvalificering\nAnbudsgivaren ska inneha")


async def test_read_pages_of_a_chosen_document(db_session: AsyncSession, tender: Tender) -> None:
    pages = await read_pages(db_session, tender.notice.id, 1, 5, document_id=tender.annex.id)
    assert [(page.filename, page.page_no, page.section) for page in pages] == [
        ("Prisbilaga.txt", 1, "prisbilaga")
    ]


async def test_read_pages_is_scoped_to_the_notice(db_session: AsyncSession, tender: Tender) -> None:
    assert await read_pages(db_session, tender.other_notice.id, 1, 2, document_id=tender.annex.id) == []
    assert await read_pages(db_session, tender.notice.id, 3, 2) == []
    assert [page.page_no for page in await read_pages(db_session, tender.notice.id, -5, 1)] == [1]


# --- find_quote -----------------------------------------------------------------------


async def test_find_quote_verified_on_the_given_page(db_session: AsyncSession, tender: Tender) -> None:
    check = await find_quote(db_session, tender.notice.id, "Försäkringsbevis ska bifogas anbudet.", page=2)
    assert (check.check, check.found_page, check.document_id, check.exact) == (
        "verified",
        2,
        tender.main.id,
        True,
    )
    assert check.excerpt is not None and "**Försäkringsbevis ska bifogas anbudet.**" in check.excerpt


async def test_find_quote_on_another_page_is_moved(db_session: AsyncSession, tender: Tender) -> None:
    check = await find_quote(db_session, tender.notice.id, "försäkringsbevis ska bifogas anbudet", page=4)
    assert (check.check, check.requested_page, check.found_page) == ("moved", 4, 2)


async def test_find_quote_searches_every_document(db_session: AsyncSession, tender: Tender) -> None:
    check = await find_quote(
        db_session, tender.notice.id, "Timpris för målare anges i kronor exklusive moms", page=1
    )
    assert (check.check, check.document_id, check.filename) == ("verified", tender.annex.id, "Prisbilaga.txt")


async def test_find_quote_without_page_and_with_fuzzy_match(db_session: AsyncSession, tender: Tender) -> None:
    check = await find_quote(
        db_session, tender.notice.id, "Arbetet ska utföras enligt AMA Hus 21 och målning ska ske"
    )
    assert (check.check, check.found_page, check.exact) == ("verified", 3, False)


async def test_find_quote_paraphrase_is_unverified(db_session: AsyncSession, tender: Tender) -> None:
    check = await find_quote(
        db_session, tender.notice.id, "Leverantören måste ha en försäkring på fem miljoner", page=2
    )
    assert (check.check, check.found_page, check.document_id, check.excerpt) == (
        "unverified",
        None,
        None,
        None,
    )


async def test_find_quote_for_a_notice_without_documents(db_session: AsyncSession, tender: Tender) -> None:
    check = await find_quote(db_session, uuid.uuid4(), "Försäkringsbevis ska bifogas anbudet.")
    assert (check.check, check.requested_page) == ("unverified", None)
