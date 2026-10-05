"""Citation verification: normalisation, quote location and contract verification."""

from __future__ import annotations

import datetime as dt

import pytest

from anbudsklar.contracts import (
    Answer,
    Checklist,
    Citation,
    EvaluationCriterion,
    KeyDate,
    MatchAssessment,
    MatchReason,
    RequiredAttachment,
    Requirement,
    RequirementCheck,
    ReviewResult,
    TermExplanation,
)
from anbudsklar.documents.citations import (
    PageIndex,
    excerpt,
    locate_quote,
    match_quote,
    normalize,
    summarize,
    verify_answer,
    verify_checklist,
    verify_citation,
    verify_match,
    verify_review,
)

RIGHT_QUOTE = "\N{RIGHT DOUBLE QUOTATION MARK}"
GUILLEMET = "\N{RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK}"
EN_DASH = "\N{EN DASH}"
RING = "\N{COMBINING RING ABOVE}"
DIAERESIS = "\N{COMBINING DIAERESIS}"

# --- normalize ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ANBUDSGIVAREN Ska", "anbudsgivaren ska"),
        ("ska  \n\t inneha", "ska inneha"),
        ("5\N{NO-BREAK SPACE}000\N{NARROW NO-BREAK SPACE}000 kronor", "5 000 000 kronor"),
        ("anbuds\N{SOFT HYPHEN}givare", "anbudsgivare"),
        ("kvalifi-\nceringskrav", "kvalificeringskrav"),
        ("kvalifi- ceringskrav", "kvalificeringskrav"),
        ("IT-system", "itsystem"),
        ("\N{LEFT DOUBLE QUOTATION MARK}Anbud\N{RIGHT DOUBLE QUOTATION MARK}", "anbud"),
        (f"{GUILLEMET}Anbud{GUILLEMET}", "anbud"),
        ("\N{SINGLE LOW-9 QUOTATION MARK}Anbud\N{LEFT SINGLE QUOTATION MARK}", "anbud"),
        ("pris \N{EN DASH} kvalitet", "pris - kvalitet"),
        ("pris \N{EM DASH} kvalitet", "pris - kvalitet"),
        ("pris \N{MINUS SIGN} kvalitet", "pris - kvalitet"),
        ("\N{LATIN SMALL LIGATURE FI}rmans \N{LATIN SMALL LIGATURE FL}ytt", "firmans flytt"),
        ("\N{BULLET} Ansvarsförsäkring", "ansvarsforsakring"),
        ("anbud\N{ZERO WIDTH SPACE}et", "anbudet"),
        ("Två år", "tva ar"),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw) == expected


def test_normalize_treats_decomposed_letters_like_composed_ones() -> None:
    composed = "Förfrågningsunderlag för målning"
    decomposed = f"Fo{DIAERESIS}rfra{RING}gningsunderlag fo{DIAERESIS}r ma{RING}lning"
    assert normalize(decomposed) == normalize(composed)


def test_normalize_ignores_spacing_diaeresis_from_old_pdf_generators() -> None:
    assert normalize("f\N{DIAERESIS}or").replace(" ", "") == normalize("för")


# --- locate_quote ---------------------------------------------------------------------


def test_exact_quote_on_cited_page_is_verified(tender_pages: list[str]) -> None:
    assert locate_quote("Försäkringsbevis ska bifogas anbudet.", tender_pages, 2) == ("verified", 2)


def test_quote_spanning_a_line_break_is_verified(tender_pages: list[str]) -> None:
    quote = "Målning ska ske med miljömärkt färg"
    assert locate_quote(quote, tender_pages, 3) == ("verified", 3)


def test_quote_across_a_hyphenated_line_break_is_verified(tender_pages: list[str]) -> None:
    quote = "Anbudsgivaren ska inneha en giltig ansvarsförsäkring om minst 5 000 000 kronor"
    match = match_quote(quote, PageIndex(tender_pages), 2)
    assert (match.check, match.page, match.exact) == ("verified", 2, True)


def test_typographic_quotes_dashes_and_case_do_not_matter() -> None:
    pages = [f"Märk kuvertet {RIGHT_QUOTE}Anbud {EN_DASH} Solbacken{RIGHT_QUOTE}."]
    assert locate_quote('MÄRK KUVERTET "Anbud - Solbacken".', pages, 1) == ("verified", 1)


def test_missing_spaces_from_pdf_extraction_do_not_matter() -> None:
    pages = ["Anbudetska vara giltigt i 90dagar."]
    assert locate_quote("Anbudet ska vara giltigt i 90 dagar", pages, 1) == ("verified", 1)


def test_soft_hyphen_and_non_breaking_space_in_page_text() -> None:
    pages = ["Ansvars\N{SOFT HYPHEN}försäkring om minst 5\N{NO-BREAK SPACE}000\N{NO-BREAK SPACE}000 kronor."]
    assert locate_quote("ansvarsförsäkring om minst 5 000 000 kronor", pages, 1) == ("verified", 1)


def test_hyphen_kept_in_page_but_dropped_in_quote() -> None:
    pages = ["Fakturor skickas via e-post till kommunens IT-\nsystem."]
    assert locate_quote("Fakturor skickas via epost till kommunens IT-system", pages, 1) == ("verified", 1)


def test_quote_on_the_wrong_page_is_moved(tender_pages: list[str]) -> None:
    assert locate_quote("Pris 70 %, kvalitet 30 %.", tender_pages, 1) == ("moved", 4)


def test_moved_prefers_the_page_nearest_the_cited_one() -> None:
    pages = ["Vite utgår.", "Inledning", "Avtalet", "Bilagor", "Vite utgår.", "Slut"]
    assert locate_quote("Vite utgår.", pages, 4) == ("moved", 5)
    assert locate_quote("Vite utgår.", pages, 2) == ("moved", 1)


def test_cited_page_beyond_the_document_gives_moved(tender_pages: list[str]) -> None:
    assert locate_quote("Försäkringsbevis ska bifogas anbudet.", tender_pages, 9) == ("moved", 2)


def test_without_a_cited_page_any_page_verifies(tender_pages: list[str]) -> None:
    assert locate_quote("Försäkringsbevis ska bifogas anbudet.", tender_pages, None) == ("verified", 2)


def test_paraphrase_is_unverified(tender_pages: list[str]) -> None:
    quote = "Leverantören måste ha en försäkring på minst fem miljoner kronor"
    assert locate_quote(quote, tender_pages, 2) == ("unverified", None)


def test_close_paraphrase_with_changed_words_is_unverified(tender_pages: list[str]) -> None:
    quote = "Anbudsgivaren måste ha en ansvarsförsäkring på fem miljoner"
    assert locate_quote(quote, tender_pages, 2) == ("unverified", None)


def test_small_typo_is_a_fuzzy_match_on_the_cited_page(tender_pages: list[str]) -> None:
    quote = "Anbudsgivaren ska inneha en giltig ansvarsförsäkirng om minst 5 000 000 kronor"
    match = match_quote(quote, PageIndex(tender_pages), 2)
    assert (match.check, match.page, match.exact) == ("verified", 2, False)
    assert match.score >= 90


def test_fuzzy_match_on_another_page_is_moved(tender_pages: list[str]) -> None:
    quote = "Anbudet ska vara giltigt i 90 dagar efter sista anbudsdagen"
    match = match_quote(quote, PageIndex(tender_pages), 2)
    assert (match.check, match.page, match.exact) == ("moved", 4, False)


def test_fuzzy_match_never_accepts_a_different_number(tender_pages: list[str]) -> None:
    quote = "Anbudet ska vara giltigt i 60 dagar efter sista anbudsdag"
    assert locate_quote(quote, tender_pages, 4) == ("unverified", None)


def test_fuzzy_match_rejects_a_changed_amount(tender_pages: list[str]) -> None:
    quote = "ansvarsförsäkring om minst 3 000 000 kronor per skadetillfälle"
    assert locate_quote(quote, tender_pages, 2) == ("unverified", None)


# --- guards: numbers, month names and negations ---------------------------------------

PENALTY_PAGE = (
    "6 Vite\nVid försening ska leverantören betala vite med 0,5 procent av det fasta priset för varje "
    "påbörjad vecka, dock högst 10 procent."
)


@pytest.mark.parametrize(
    "quote",
    [
        "vite med 5 procent av det fasta priset för varje påbörjad vecka",
        "5 procent av det fasta priset för varje påbörjad vecka",  # an exact substring of "0,5 procent"
        "vite med 0 procent av det fasta priset för varje påbörjad vecka",
        "vite med 5,0 procent av det fasta priset för varje påbörjad vecka",
        "vite med 50 procent av det fasta priset för varje påbörjad vecka",
    ],
)
def test_a_decimal_is_one_number(quote: str) -> None:
    assert locate_quote(quote, [PENALTY_PAGE], 1) == ("unverified", None)


def test_the_right_decimal_verifies_however_it_is_written() -> None:
    assert locate_quote("vite med 0,5 procent av det fasta priset", [PENALTY_PAGE], 1) == ("verified", 1)
    match = match_quote("vite med 0.5 procent av det fasta priset", PageIndex([PENALTY_PAGE]), 1)
    assert (match.check, match.exact) == ("verified", False)


def test_a_number_cut_at_the_start_of_the_passage_is_not_the_same_number() -> None:
    pages = ["Betalning sker 160 dagar efter godkänd faktura."]
    assert locate_quote("60 dagar efter godkänd faktura", pages, 1) == ("unverified", None)
    pages = [
        "Betalning sker 160 dagar efter godkänd faktura. Reklamation inom 60 dagar efter godkänd faktura."
    ]
    match = match_quote("60 dagar efter godkänd faktura", PageIndex(pages), 1)
    assert (match.check, match.exact) == ("verified", True)
    assert match.start is not None and pages[0][match.start : match.start + 2] == "60"


def test_thousands_groups_belong_to_their_number() -> None:
    pages = ["Ansvarsförsäkring om minst 1 500 000 kronor krävs."]
    assert locate_quote("500 000 kronor krävs", pages, 1) == ("unverified", None)
    assert locate_quote("minst 1500000 kronor", pages, 1) == ("verified", 1)


def test_a_changed_month_name_never_verifies() -> None:
    pages = ["Sista anbudsdag är den 9 november 2026 klockan 23.59 enligt annonsen."]
    assert locate_quote("Sista anbudsdag är den 9 december 2026 klockan 23.59", pages, 1) == (
        "unverified",
        None,
    )


def test_a_time_with_colon_matches_a_time_with_point() -> None:
    pages = ["Sista anbudsdag 2026-11-09 kl. 23.59 i e-Avrop."]
    match = match_quote("Sista anbudsdag 2026-11-09 kl. 23:59", PageIndex(pages), 1)
    assert (match.check, match.exact) == ("verified", False)


NEGATION_PAGES = [
    "Alternativa anbud godtas inte. Varje anbudsgivare får lämna ett anbud.",
    "Det är inte tillåtet att lämna reservationer mot villkoren.",
    "Anbudet ska vara skrivet på svenska, inte engelska.",
]


def test_a_quote_cut_before_a_negation_is_unverified() -> None:
    assert locate_quote("Alternativa anbud godtas", NEGATION_PAGES, 1) == ("unverified", None)
    assert locate_quote("Alternativa anbud godtas inte", NEGATION_PAGES, 1) == ("verified", 1)


def test_a_quote_starting_after_a_negation_is_unverified() -> None:
    assert locate_quote("tillåtet att lämna reservationer mot villkoren", NEGATION_PAGES, 2) == (
        "unverified",
        None,
    )


def test_a_negation_after_punctuation_does_not_count() -> None:
    assert locate_quote("Anbudet ska vara skrivet på svenska,", NEGATION_PAGES, 3) == ("verified", 3)
    assert locate_quote("Varje anbudsgivare får lämna ett anbud.", NEGATION_PAGES, 1) == ("verified", 1)


def test_a_fuzzy_match_never_drops_a_negation() -> None:
    quote = "Alternativa anbud godtas. Varje anbudsgivare får lämna ett anbud."
    assert locate_quote(quote, NEGATION_PAGES, 1) == ("unverified", None)


def test_numbers_are_checked_across_a_page_break() -> None:
    pages = ["Anbudet ska vara giltigt i", "90 dagar efter sista anbudsdag."]
    assert locate_quote("Anbudet ska vara giltigt i 90 dagar", pages, 1) == ("verified", 1)
    assert locate_quote("Anbudet ska vara giltigt i 9 dagar", pages, 1) == ("unverified", None)
    assert locate_quote("Anbudet ska vara giltigt … 90 dagar", pages, 1) == ("verified", 1)


def test_short_quotes_must_match_exactly() -> None:
    pages = ["Pris 70 %"]
    assert locate_quote("Pris 75 %", pages, 1) == ("unverified", None)
    assert locate_quote("pris 70%", pages, 1) == ("verified", 1)


@pytest.mark.parametrize("ellipsis", ["…", "...", "[…]", "(...)"])
def test_quote_with_ellipsis_matches_parts_in_order(tender_pages: list[str], ellipsis: str) -> None:
    quote = f"Anbudsgivaren ska inneha {ellipsis} Försäkringsbevis ska bifogas anbudet."
    assert locate_quote(quote, tender_pages, 2) == ("verified", 2)


def test_quote_with_ellipsis_in_the_wrong_order_is_unverified(tender_pages: list[str]) -> None:
    quote = "Försäkringsbevis ska bifogas anbudet … Anbudsgivaren ska inneha"
    assert locate_quote(quote, tender_pages, 2) == ("unverified", None)


def test_ellipsis_parts_far_apart_are_unverified() -> None:
    filler = "Text om något helt annat. " * 30
    pages = [f"Anbudsgivaren ska inneha en ansvarsförsäkring. {filler} Försäkringsbevis ska bifogas anbudet."]
    quote = "Anbudsgivaren ska inneha en ansvarsförsäkring … Försäkringsbevis ska bifogas anbudet."
    assert locate_quote(quote, pages, 1) == ("unverified", None)


def test_quote_running_over_a_page_break_belongs_to_its_first_page() -> None:
    pages = ["Avtalet gäller i två år med möjlighet till", "förlängning i ett plus ett år. Övrigt."]
    quote = "Avtalet gäller i två år med möjlighet till förlängning i ett plus ett år"
    assert locate_quote(quote, pages, 1) == ("verified", 1)
    assert locate_quote(quote, pages, 2) == ("moved", 1)


def test_quote_at_the_start_of_the_next_page_is_not_attributed_to_the_previous() -> None:
    pages = ["Avtalet gäller i två år.", "Förlängning kan ske i ett år."]
    assert locate_quote("Förlängning kan ske i ett år.", pages, 1) == ("moved", 2)


def test_nothing_to_match_is_unverified() -> None:
    assert locate_quote("Försäkringsbevis ska bifogas", [], 1) == ("unverified", None)
    assert locate_quote("…", ["Försäkringsbevis ska bifogas"], 1) == ("unverified", None)


def test_match_offsets_point_into_the_original_page_text(tender_pages: list[str]) -> None:
    quote = "ansvarsförsäkring om minst 5 000 000 kronor"
    match = match_quote(quote, PageIndex(tender_pages), 2)
    assert match.start is not None and match.end is not None
    assert tender_pages[1][match.start : match.end] == "ansvarsförsäk-\nring om minst 5 000 000 kronor"


def test_excerpt_highlights_the_passage_with_context() -> None:
    text = "Inledande text. Anbudsgivaren ska inneha en ansvarsförsäkring om minst 5 000 000 kronor. Slut."
    start = text.index("ansvarsförsäkring")
    snippet = excerpt(text, start + 3, start + 10, context=20)
    assert "**ansvarsförsäkring**" in snippet
    assert snippet.startswith("… ") and snippet.endswith(" …")
    assert excerpt("Kort text", 0, 4) == "**Kort** text"


# --- verifying contract objects -------------------------------------------------------


def _citation(page: int, quote: str) -> Citation:
    return Citation(page=page, quote=quote)


def test_verify_citation_sets_check_and_found_page(tender_pages: list[str]) -> None:
    moved = verify_citation(_citation(1, "Försäkringsbevis ska bifogas anbudet."), tender_pages)
    assert (moved.check, moved.found_page) == ("moved", 2)
    verified = verify_citation(_citation(2, "Försäkringsbevis ska bifogas anbudet."), tender_pages)
    assert (verified.check, verified.found_page) == ("verified", None)
    unverified = verify_citation(_citation(2, "Detta står inte i underlaget alls."), tender_pages)
    assert (unverified.check, unverified.found_page) == ("unverified", None)


def test_verify_citation_overrides_a_model_claimed_check(tender_pages: list[str]) -> None:
    claimed = Citation(page=2, quote="Detta står inte i underlaget alls.", check="verified")
    assert verify_citation(claimed, tender_pages).check == "unverified"


def test_verify_checklist_checks_every_citation_and_counts(tender_pages: list[str]) -> None:
    checklist = Checklist(
        summary="Ommålning av förskola.",
        requirements=[
            Requirement(
                id="K1",
                kind="kvalificeringskrav",
                title="Ansvarsförsäkring",
                plain_language="Ni behöver en ansvarsförsäkring.",
                citation=_citation(2, "ansvarsförsäkring om minst 5 000 000 kronor"),
            ),
            Requirement(
                id="K2",
                kind="skallkrav",
                title="Påhittat krav",
                plain_language="Finns inte i underlaget.",
                citation=_citation(3, "Anbudsgivaren ska ha ISO 9001-certifiering."),
            ),
        ],
        attachments=[
            RequiredAttachment(name="Försäkringsbevis", citation=_citation(1, "Försäkringsbevis ska bifogas"))
        ],
        evaluation=[
            EvaluationCriterion(
                name="Pris",
                weight_percent=70,
                how_assessed="Lägsta pris.",
                citation=_citation(4, "Pris 70 %"),
            )
        ],
        dates=[
            KeyDate(
                kind="sista_anbudsdag",
                description="Sista anbudsdag",
                citation=_citation(1, "Sista anbudsdag är 2026-11-14."),
            )
        ],
        terms=[
            TermExplanation(term="AMA", explanation="Branschstandard.", citation=_citation(3, "AMA Hus 21")),
            TermExplanation(term="Anbud", explanation="Ert erbjudande."),
        ],
    )
    verified, summary = verify_checklist(checklist, tender_pages)
    assert [r.citation.check for r in verified.requirements] == ["verified", "unverified"]
    assert verified.attachments[0].citation.check == "moved"
    assert verified.attachments[0].citation.found_page == 2
    assert verified.evaluation[0].citation.check == "verified"
    assert verified.dates[0].citation.check == "verified"
    assert verified.terms[0].citation is not None and verified.terms[0].citation.check == "verified"
    assert verified.terms[1].citation is None
    assert summary.model_dump() == {
        "citations_total": 6,
        "citations_verified": 4,
        "citations_moved": 1,
        "citations_unverified": 1,
    }
    assert checklist.requirements[0].citation.check is None  # the input is not mutated


def test_verify_answer(tender_pages: list[str]) -> None:
    answer = Answer(
        answer="Ja, försäkringsbevis ska bifogas.",
        found_in_document=True,
        citations=[_citation(4, "Försäkringsbevis ska bifogas anbudet.")],
        suggest_formal_question=False,
    )
    verified = verify_answer(answer, tender_pages)
    assert (verified.citations[0].check, verified.citations[0].found_page) == ("moved", 2)


def test_verify_match_keeps_reasons_without_citation(tender_pages: list[str]) -> None:
    assessment = MatchAssessment(
        fit="passar",
        summary="Passar bra.",
        reasons=[
            MatchReason(
                kind="styrka",
                text="Målning är er kärnverksamhet.",
                citation=_citation(3, "Målning ska ske med miljömärkt färg"),
            ),
            MatchReason(kind="oklart", text="Referenser saknas i profilen."),
        ],
    )
    verified = verify_match(assessment, tender_pages)
    assert verified.reasons[0].citation is not None
    assert verified.reasons[0].citation.check == "verified"
    assert verified.reasons[1].citation is None


def test_verify_review_checks_quotes_against_the_draft() -> None:
    draft = [
        "Anbud från Målerifirman i Matfors AB (fiktivt).",
        "Vi har ansvarsförsäkring om 5 000 000 kronor hos Exempelförsäkring.",
        "Referensuppdrag: Ommålning av Kvarnbackens skola 2025.",
    ]
    review = ReviewResult(
        summary="Två brister.",
        checks=[
            RequirementCheck(
                requirement_id="K1",
                status="obevisat",
                comment="Försäkringsbevis saknas.",
                draft_quote="ansvarsförsäkring om 5 000 000 kronor",
                draft_page=2,
            ),
            RequirementCheck(
                requirement_id="K2",
                status="uppfyllt",
                comment="Referens finns.",
                draft_quote="Ommålning av Kvarnbackens skola 2025",
                draft_page=1,
            ),
            RequirementCheck(
                requirement_id="K3",
                status="uppfyllt",
                comment="Påstått citat.",
                draft_quote="Vi är certifierade enligt ISO 14001.",
                draft_page=2,
            ),
            RequirementCheck(requirement_id="K4", status="saknas", comment="Inget i utkastet."),
        ],
    )
    checks = verify_review(review, draft).checks
    assert [(c.draft_check, c.draft_page) for c in checks] == [
        ("verified", 2),
        ("moved", 3),
        ("unverified", 2),
        (None, None),
    ]


def test_summarize_counts_unchecked_as_unverified() -> None:
    summary = summarize([_citation(1, "abc"), Citation(page=1, quote="def", check="moved")])
    assert (summary.citations_total, summary.citations_moved, summary.citations_unverified) == (2, 1, 1)


# --- structured values in checklists --------------------------------------------------


def _checklist(dates: list[KeyDate], evaluation: list[EvaluationCriterion] | None = None) -> Checklist:
    return Checklist(
        summary="Ommålning av förskola.", requirements=[], dates=dates, evaluation=evaluation or []
    )


def test_a_date_its_quote_does_not_state_is_unverified(tender_pages: list[str]) -> None:
    quote = "Sista anbudsdag är 2026-11-14."
    checklist = _checklist(
        [
            KeyDate(
                kind="sista_anbudsdag",
                date=dt.date(2026, 11, 14),
                description="Rätt",
                citation=_citation(1, quote),
            ),
            KeyDate(
                kind="sista_anbudsdag",
                date=dt.date(2026, 11, 24),
                description="Fel",
                citation=_citation(1, quote),
            ),
            KeyDate(
                kind="fragestopp",
                date=dt.date(2026, 11, 4),
                description="Flyttad",
                citation=_citation(3, quote),
            ),
        ]
    )
    verified, summary = verify_checklist(checklist, tender_pages)
    assert [(d.citation.check, d.citation.found_page) for d in verified.dates] == [
        ("verified", None),
        ("unverified", None),
        ("unverified", None),  # the quote is on page 1, but it does not say 2026-11-04
    ]
    assert (summary.citations_verified, summary.citations_unverified) == (1, 2)


def test_a_computed_date_is_unverified() -> None:
    pages = ["Frågor ska ställas senast sex dagar före sista anbudsdag."]
    quote = "Frågor ska ställas senast sex dagar före sista anbudsdag."
    item = KeyDate(
        kind="fragestopp", date=dt.date(2026, 11, 3), description="Frågestopp", citation=_citation(1, quote)
    )
    verified, _ = verify_checklist(_checklist([item]), pages)
    assert verified.dates[0].citation.check == "unverified"


def test_a_date_without_year_in_the_quote_still_verifies() -> None:
    pages = ["Frågor ska ha kommit in senast den 3 november klockan 12.00."]
    quote = "senast den 3 november klockan 12.00"
    item = KeyDate(
        kind="fragestopp", date=dt.date(2026, 11, 3), description="Frågestopp", citation=_citation(1, quote)
    )
    verified, _ = verify_checklist(_checklist([item]), pages)
    assert verified.dates[0].citation.check == "verified"


def test_a_moved_quote_that_states_the_date_stays_moved(tender_pages: list[str]) -> None:
    quote = "Frågor ställs i e-Avrop senast 2026-11-04."
    item = KeyDate(
        kind="fragestopp", date=dt.date(2026, 11, 4), description="Frågestopp", citation=_citation(2, quote)
    )
    verified, _ = verify_checklist(_checklist([item]), tender_pages)
    assert (verified.dates[0].citation.check, verified.dates[0].citation.found_page) == ("moved", 1)


def test_a_weight_its_quote_does_not_state_is_unverified(tender_pages: list[str]) -> None:
    def criterion(name: str, weight: float | None) -> EvaluationCriterion:
        return EvaluationCriterion(
            name=name,
            weight_percent=weight,
            how_assessed="Enligt underlaget.",
            citation=_citation(4, "Pris 70 %, kvalitet 30 %."),
        )

    checklist = _checklist(
        [],
        [criterion("Pris", 70), criterion("Kvalitet", 30), criterion("Pris", 60), criterion("Miljö", None)],
    )
    verified, summary = verify_checklist(checklist, tender_pages)
    assert [e.citation.check for e in verified.evaluation] == [
        "verified",
        "verified",
        "unverified",
        "verified",
    ]
    assert summary.citations_unverified == 1
