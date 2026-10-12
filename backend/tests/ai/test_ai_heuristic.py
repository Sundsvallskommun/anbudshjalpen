"""The offline heuristic engine: deterministic output with verifiable quotes."""

from __future__ import annotations

import datetime as dt

import pytest

from anbudsklar.ai.engine import RuleContext
from anbudsklar.ai.heuristic import ANSWER_LEAD, HeuristicEngine, running_lines, split_sentences
from anbudsklar.contracts import (
    Checklist,
    Citation,
    CompanyProfile,
    CpvCandidate,
    DocumentSet,
    NoticeContext,
    PagedDocument,
    PublishedAnswerInput,
    RequiredAttachment,
    Requirement,
)
from anbudsklar.contracts.tasks import RequirementKind
from anbudsklar.documents.citations import verify_answer, verify_checklist, verify_review
from anbudsklar.services.matching import prefilter_score

NOTICE = NoticeContext(notice_id="n1", title="Ommålning av förskola", cpv_codes=["45442100"])


def assert_plain_text(text: str) -> None:
    """How a result was made is carried by `engine`; the text itself carries no prefix about it."""

    assert "språkmodell" not in text.lower()
    assert not text.startswith("Automatisk")


# Fictitious procurement document (not real tender text).
PAGES = [
    "Administrativa föreskrifter\n"
    "Upphandlingen genomförs med förenklat förfarande.\n"
    "Frågor ska ställas senast 2026-10-20 i e-Avrop.\n"
    "Anbud ska ha kommit in senast den 2 november 2026.\n"
    "Anbudet ska vara bindande i 90 dagar.\n"
    "Alternativa anbud godtas inte.\n"
    "Kommunen ska publicera tilldelningsbeslutet i e-Avrop.",
    "Kvalificering\n"
    "Leverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor. Försäkringsbevis ska\n"
    "bifogas anbudet.\n"
    "- Leverantören ska redovisa två referensuppdrag på bilaga 3 Referensblankett.\n"
    "- Leverantören ska vara registrerad för F-skatt, t.ex. enligt Skatteverkets intyg.",
    "Utvärdering\nUtvärderingen sker med pris 70 % och kvalitet 30 %.\n"
    "Avtalsvillkor\nVid försenad leverans har kommunen rätt till vite.\nMoms 25 % tillkommer.",
]
DOCUMENT = PagedDocument(filename="underlag.pdf", pages=PAGES)
DOCUMENTS = DocumentSet.of([DOCUMENT])


def _set(pages: list[str], filename: str = "u.pdf") -> DocumentSet:
    return DocumentSet.of([PagedDocument(filename=filename, pages=pages)])


def test_split_sentences_keeps_abbreviations_and_headings_apart() -> None:
    sentences = split_sentences(
        "Rubrik\nDet här gäller, t.ex. Pris och kvalitet. Enligt 4 kap. 1 § LOU gäller detta."
    )
    assert sentences == [
        "Rubrik",
        "Det här gäller, t.ex. Pris och kvalitet.",
        "Enligt 4 kap. 1 § LOU gäller detta.",
    ]


async def test_interpret_document_quotes_verify_on_the_cited_page() -> None:
    checklist, run = await HeuristicEngine().interpret_document(NOTICE, DOCUMENTS)
    _, summary = verify_checklist(checklist, PAGES)
    assert summary.citations_total > 0
    assert summary.citations_verified == summary.citations_total
    assert checklist.summary == (
        "Underlaget har 3 sidor. Listan har 8 krav, 2 bilagor, 2 utvärderingskriterier och 3 datum, "
        "alla som utdrag ur texten. Kontrollera mot underlaget innan du använder listan."
    )
    assert_plain_text(checklist.summary)
    assert run.engine == "heuristic"


async def test_interpret_document_finds_requirements_and_kinds() -> None:
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, DOCUMENTS)
    by_quote = {requirement.citation.quote: requirement for requirement in checklist.requirements}
    insurance = next(r for q, r in by_quote.items() if "ansvarsförsäkring" in q)
    assert insurance.kind == "kvalificeringskrav"
    assert insurance.citation.page == 2
    references = next(r for q, r in by_quote.items() if "referensuppdrag" in q)
    assert references.evidence == "Referensuppdrag, Referensblankett, Bilaga 3"
    assert next(r for q, r in by_quote.items() if "vite" in q).kind == "avtalsvillkor"
    assert not any("tilldelningsbeslutet" in quote for quote in by_quote)  # the buyer's own duty
    assert any(quote == "Alternativa anbud godtas inte." for quote in by_quote)  # prohibitions count
    assert [requirement.id for requirement in checklist.requirements][:2] == ["K1", "K2"]


async def test_interpret_document_dates_weights_terms_and_procedure() -> None:
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, DOCUMENTS)
    dates = {(item.kind, item.date) for item in checklist.dates}
    assert ("fragestopp", dt.date(2026, 10, 20)) in dates
    assert ("sista_anbudsdag", dt.date(2026, 11, 2)) in dates
    assert ("anbudets_giltighet", None) in dates
    weights = {item.name: item.weight_percent for item in checklist.evaluation}
    assert weights == {"Pris": 70.0, "Kvalitet": 30.0}  # "Moms 25 %" is not a criterion
    assert {attachment.name for attachment in checklist.attachments} >= {"Bilaga 3 Referensblankett"}
    terms = {term.term: term.explanation for term in checklist.terms}
    assert set(terms) >= {"förenklat förfarande", "F-skatt", "vite"}
    # The term left LOU on 1 February 2022: it is explained as history, never given as the procedure.
    assert "1 februari 2022" in terms["förenklat förfarande"]
    assert checklist.procedure == "Upphandling under tröskelvärdena (19 kap. LOU)"
    assert checklist.open_questions == []


async def test_interpret_document_reports_what_it_could_not_find() -> None:
    checklist, _ = await HeuristicEngine().interpret_document(
        NOTICE, _set(["Ingen relevant text här."], "tom.txt")
    )
    assert checklist.requirements == []
    assert len(checklist.open_questions) == 3
    assert checklist.summary.startswith("Underlaget har 1 sida. Listan har 0 krav, 0 bilagor,")


def _checklist() -> Checklist:
    return Checklist(
        summary="s",
        requirements=[
            Requirement(
                id="K1",
                kind="kvalificeringskrav",
                title="Ansvarsförsäkring om minst 5 000 000 kronor",
                plain_language="p",
                evidence="Försäkringsbevis",
                citation=Citation(
                    page=2, quote="Leverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor."
                ),
            ),
            Requirement(
                id="K2",
                kind="kvalificeringskrav",
                title="Två referensuppdrag från offentlig verksamhet",
                plain_language="p",
                citation=Citation(page=2, quote="Leverantören ska redovisa två referensuppdrag på bilaga 3."),
            ),
            Requirement(
                id="K3",
                kind="skallkrav",
                title="Prisbilagan ska fyllas i",
                plain_language="p",
                evidence="Prisbilaga",
                citation=Citation(page=4, quote="Prisbilagan ska fyllas i."),
            ),
        ],
        attachments=[
            RequiredAttachment(name="Bilaga 3 Referensblankett", citation=Citation(page=2, quote="bilaga 3")),
            RequiredAttachment(
                name="Prisbilaga", citation=Citation(page=4, quote="Prisbilagan ska fyllas i.")
            ),
        ],
    )


async def test_review_draft_flags_missing_proof_and_missing_requirements() -> None:
    draft_pages = [
        "Anbud från Målerifirman i Matfors AB (fiktiv).\n"
        "Vi har en ansvarsförsäkring om 5 000 000 kronor.\n"
        "Prisbilagan är ifylld och bifogas som bilaga 1."
    ]
    review, _ = await HeuristicEngine().review_draft(
        _checklist(), PagedDocument(filename="utkast.pdf", pages=draft_pages)
    )
    status = {check.requirement_id: check.status for check in review.checks}
    assert status == {"K1": "obevisat", "K2": "saknas", "K3": "uppfyllt"}
    attachments = {check.name: check.status for check in review.attachments}
    assert attachments == {"Bilaga 3 Referensblankett": "saknas", "Prisbilaga": "oklart"}
    verified = verify_review(review, draft_pages)
    assert all(check.draft_check == "verified" for check in verified.checks if check.draft_quote)
    assert review.summary.startswith("I utkastet ser 1 av 3 krav bra ut.")
    assert_plain_text(review.summary)


async def test_answer_question_cites_the_best_sentences() -> None:
    answer, _ = await HeuristicEngine().answer_question(
        NOTICE, DocumentSet.of([DOCUMENT]), "Hur stor ansvarsförsäkring krävs?", []
    )
    assert answer.found_in_document is True
    assert answer.suggest_formal_question is False
    assert answer.citations[0].page == 2
    # The first line is the lead the web app shows in bold, then one line per citation.
    lead, *lines = answer.answer.splitlines()
    assert lead == ANSWER_LEAD
    assert len(lines) == len(answer.citations)
    assert lines[0].endswith("(sida 2)")
    verified = verify_answer(answer, [DOCUMENT])
    assert all(citation.check == "verified" for citation in verified.citations)


async def test_answer_question_reads_the_attachments_and_names_the_document() -> None:
    attachment = PagedDocument(
        document_id="att",
        filename="6.6 Krav på Entreprenör.pdf",
        pages=["Krav på entreprenören\nEntreprenören ska lämna en hållbarhetsredovisning varje år."],
    )
    main = PagedDocument(document_id="main", filename="underlag.pdf", pages=PAGES)

    answer, _ = await HeuristicEngine().answer_question(
        NOTICE, DocumentSet.of([main, attachment]), "Krävs en hållbarhetsredovisning?", []
    )

    assert answer.found_in_document is True
    assert answer.citations[0].document == attachment.filename
    assert answer.answer.splitlines()[1].endswith("(6.6 Krav på Entreprenör.pdf, sida 1)")
    verified = verify_answer(answer, [main, attachment])
    assert (verified.citations[0].check, verified.citations[0].document_id) == ("verified", "att")


async def test_answer_question_suggests_formal_question_when_not_found() -> None:
    answer, _ = await HeuristicEngine().answer_question(
        NOTICE, DocumentSet.of([DOCUMENT]), "Får vi använda underleverantörer?", []
    )
    assert answer.found_in_document is False
    assert answer.suggest_formal_question is True
    assert answer.citations == []
    assert "e-Avrop" in answer.answer
    assert "samma svar" in answer.answer  # the formal question reaches every supplier
    assert_plain_text(answer.answer)


async def test_assess_match_uses_cpv_and_flags_unclear_requirements() -> None:
    profile = CompanyProfile(name="Målerifirman (fiktiv)", description="Vi utför ommålning av förskolor.")
    profile = profile.model_copy(update={"cpv_codes": ["45442110"]})
    assessment, _ = await HeuristicEngine().assess_match(profile, NOTICE, _checklist())
    assert assessment.fit == "passar_delvis"  # strong CPV match, but insurance and references are unclear
    kinds = [reason.kind for reason in assessment.reasons]
    assert kinds[0] == "styrka"
    unclear = [reason for reason in assessment.reasons if reason.kind == "oklart"]
    assert {reason.requirement_id for reason in unclear} == {"K1", "K2"}
    assert unclear[0].citation is not None


async def test_assess_match_without_overlap_does_not_fit() -> None:
    profile = CompanyProfile(name="Städbolaget (fiktiv)", description="Lokalvård", cpv_codes=["90910000"])
    assessment, _ = await HeuristicEngine().assess_match(profile, NOTICE, None)
    assert assessment.fit == "passar_inte"
    assert assessment.reasons[0].kind == "hinder"


async def test_suggest_cpv_ranks_by_shared_words_and_skips_bad_codes() -> None:
    candidates = [
        CpvCandidate(code="45000000", label="Byggnadsarbete"),
        CpvCandidate(code="45442100-8", label="Målning"),
        CpvCandidate(code="4544", label="Målning och glasarbeten"),
        CpvCandidate(code="45442110", label="Målning av byggnader"),
    ]
    result, _ = await HeuristicEngine().suggest_cpv("Vi utför målning av byggnader inomhus.", candidates)
    # Ranked by shared words; ties keep the search order. Codes without eight digits are skipped.
    assert [suggestion.code for suggestion in result.suggestions] == ["45442110", "45000000", "45442100"]
    assert result.suggestions[0].reason == "Beskrivningen nämner målning och byggnader."


async def test_answer_rules_summarises_context() -> None:
    context = [
        RuleContext(
            reference="LOU 4 kap. 1 §", title="Principer", text="Upphandlande myndigheter ska behandla …"
        )
    ]
    answer, _ = await HeuristicEngine().answer_rules("Vad gäller?", None, context)
    assert_plain_text(answer.answer)
    assert answer.sources[0].reference == "LOU 4 kap. 1 §"
    assert answer.sources[0].excerpt == "Upphandlande myndigheter ska behandla …"
    assert "LOU 4 kap. 1 § – Principer: Upphandlande myndigheter ska behandla …" in answer.answer
    empty, _ = await HeuristicEngine().answer_rules("Vad gäller?", None, [])
    assert empty.sources == []
    assert "frågeportal" in empty.answer
    assert_plain_text(empty.answer)


# --- Precision of tolka_underlag (sentences adapted from the fictitious fixtures) ---------

HEADER = "Sundsvalls kommun – Ommålning av förskola (fiktiv) DEMO-0001"
FOOTER = "FIKTIVT UNDERLAG – endast för test Sida {page} av 4"
PRECISION_PAGES = [
    f"{HEADER}\nInnehåll\n1 Inledning 2\nBilaga 2 Referensblankett 4\n{FOOTER.format(page=1)}",
    f"{HEADER}\n1.6 Begrepp\n"
    "Ska-krav Krav som måste vara uppfyllda för att ett anbud ska kunna antas.\n"
    "3.4 Ansvarsförsäkring\n"
    "Anbudsgivaren ska ha en ansvarsförsäkring på minst 5 000 000 kronor per skadetillfälle. "
    "Försäkringsbevis ska\nbifogas anbudet (bilaga 4).\n"
    "3.5 Referensuppdrag\n"
    "Anbudsgivaren ska ha genomfört minst två uppdrag med målning i offentlig miljö. Varje uppdrag ska "
    "ha haft ett\nvärde av minst 200 000 kronor. Uppdragen ska redovisas i referensblanketten (bilaga 2).\n"
    "Kommunen kommer att utesluta en leverantör som inte har betalat skatter och socialförsäkringsavgifter.\n"
    "Anbudet får förkastas om anbudsgivaren inte kan förklara det låga priset.\n"
    f"{FOOTER.format(page=2)}",
    f"{HEADER}\n4.2 Leverans\n"
    "Varor som kräver kylförvaring ska transporteras i en obruten kylkedja med högst 8 °C.\n"
    "Leverantören tillhandahåller en kundtjänst som köken når vardagar mellan klockan 06.00 och 15.00.\n"
    "6.7 Vite vid försening\n"
    "Om uppdraget inte är färdigställt den 13 augusti 2027 ska leverantören betala vite för varje påbörjad "
    "vecka.\n"
    f"{FOOTER.format(page=3)}",
    f"{HEADER}\n6.8 Underleverantörer\n"
    "Innan arbetet påbörjas ska leverantören lämna namn och kontaktuppgifter för underleverantörerna.\n"
    "6.9 Arbetsrättsliga villkor\n"
    "Leverantören ska tillförsäkra arbetstagarna lön enligt det centrala kollektivavtalet.\n"
    "Leverantören ska på begäran visa att villkoren följs inom tio arbetsdagar.\n"
    "7 Bilagor\nTabellen visar vilka handlingar som ska lämnas med anbudet.\n"
    f"{FOOTER.format(page=4)}",
]


async def _requirements(pages: list[str]) -> list[Requirement]:
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, _set(pages, "u.pdf"))
    verified, summary = verify_checklist(checklist, pages)
    assert summary.citations_verified == summary.citations_total  # folding keeps every quote verbatim
    return verified.requirements


async def test_interpret_document_skips_headings_definitions_and_subordinate_clauses() -> None:
    quotes = [requirement.citation.quote for requirement in await _requirements(PRECISION_PAGES)]
    assert quotes == [
        "Anbudsgivaren ska ha en ansvarsförsäkring på minst 5 000 000 kronor per skadetillfälle.",
        "Anbudsgivaren ska ha genomfört minst två uppdrag med målning i offentlig miljö.",
        "Varor som kräver kylförvaring ska transporteras i en obruten kylkedja med högst 8 °C.",
        "Leverantören tillhandahåller en kundtjänst som köken når vardagar mellan klockan 06.00 och 15.00.",
        "Om uppdraget inte är färdigställt den 13 augusti 2027 ska leverantören betala vite för varje "
        "påbörjad vecka.",
        "Innan arbetet påbörjas ska leverantören lämna namn och kontaktuppgifter för underleverantörerna.",
        "Leverantören ska tillförsäkra arbetstagarna lön enligt det centrala kollektivavtalet.",
    ]


async def test_interpret_document_folds_elaborations_into_the_requirement() -> None:
    requirements = await _requirements(PRECISION_PAGES)
    insurance, references = requirements[0], requirements[1]
    assert insurance.evidence == "Försäkringsbevis, Bilaga 4"
    assert insurance.plain_language.endswith("Försäkringsbevis ska bifogas anbudet (bilaga 4).")
    assert "Varje uppdrag ska ha haft" in references.plain_language
    assert references.plain_language.endswith("Uppdragen ska redovisas i referensblanketten (bilaga 2).")
    labour = requirements[-1]
    assert labour.plain_language.endswith("på begäran visa att villkoren följs inom tio arbetsdagar.")


def test_running_headers_and_numbered_headings_are_boundaries() -> None:
    assert running_lines(PRECISION_PAGES) == frozenset(
        {
            "sundsvalls kommun – ommålning av förskola (fiktiv) demo-#",
            "fiktivt underlag – endast för test sida # av #",
        }
    )
    sentences = split_sentences(
        "Avtalsstart 2027-02-01\n2.3 Frågor under anbudstiden\nFrågor ställs senast den 19 oktober 2026."
    )
    assert sentences == [
        "Avtalsstart 2027-02-01",
        "2.3 Frågor under anbudstiden",
        "Frågor ställs senast den 19 oktober 2026.",
    ]


DATE_PAGES = [
    "2.2 Tidsplan\nHändelse Datum\nSista dag för anmälan till platsbesök 2026-10-13\n"
    "Sista dag för frågor 2026-10-30\nSista dag för kommunens svar på frågor 2026-11-03\n"
    "Sista anbudsdag 2026-11-09 kl. 23.59\nAvtalsstart 2027-02-01\n"
    "2.3 Frågor under anbudstiden\n"
    "Sista dag för frågor är den 30 oktober 2026. Kommunen besvarar frågor som har kommit in i tid "
    "senast den 3 november 2026, det vill säga senast sex dagar före sista anbudsdag.\n"
    "Anmälan till platsbesöket görs via frågefunktionen i e-Avrop senast den 13 oktober 2026.\n"
    "Frågor som kommer in efter frågestoppet, till exempel den 2 november 2026, besvaras inte.",
    "Avtalet gäller från den 1 februari 2027 till och med den 31 januari 2029.\n"
    "Om uppdraget inte är färdigställt för slutbesiktning den 13 augusti 2027 ska leverantören betala "
    "vite för varje påbörjad vecka.\n"
    "Den 25 oktober 2026 är sista dagen för frågor om platsbesöket.",
]


async def test_dates_take_their_kind_from_their_own_label() -> None:
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, _set(DATE_PAGES, "u.pdf"))
    dates = [(item.kind, item.date) for item in checklist.dates]
    by_kind: dict[str, list[dt.date | None]] = {}
    for kind, date in dates:
        by_kind.setdefault(kind, []).append(date)
    assert by_kind["fragestopp"] == [dt.date(2026, 10, 30)]  # one question deadline, the real one
    assert by_kind["sista_anbudsdag"] == [dt.date(2026, 11, 9)]
    assert by_kind["avtalsstart"] == [dt.date(2027, 2, 1)]  # neither the contract end nor the penalty clause
    assert set(by_kind["annat"]) >= {
        dt.date(2026, 10, 13),  # site-visit registration through the question function
        dt.date(2026, 11, 3),  # the buyer's answers
        dt.date(2029, 1, 31),  # "till och med" is the contract end
        dt.date(2027, 8, 13),  # the penalty clause's "påbörjad vecka" is no contract start
    }
    assert len(dates) == len(set(dates))


async def test_a_label_after_the_date_counts_when_none_comes_before() -> None:
    pages = ["Den 30 oktober 2026 är sista dagen för frågor."]
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, _set(pages, "u.pdf"))
    assert [(item.kind, item.date) for item in checklist.dates] == [("fragestopp", dt.date(2026, 10, 30))]


async def test_a_second_question_deadline_is_kept_as_another_date() -> None:
    pages = ["Frågor ska ställas senast 2026-10-20.\nDen 25 oktober 2026 är sista dagen för frågor."]
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, _set(pages, "u.pdf"))
    assert [(item.kind, item.date) for item in checklist.dates] == [
        ("fragestopp", dt.date(2026, 10, 20)),
        ("annat", dt.date(2026, 10, 25)),
    ]


async def test_the_last_day_for_anbudsansokan_is_not_sista_anbudsdag() -> None:
    pages = [
        "Sista dag för anbudsansökan är 2026-10-30.\n"
        "Ansökan om att få delta ska ha kommit in senast den 30 oktober 2026.\n"
        "Anbud ska ha kommit in senast 2026-12-01."
    ]
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, _set(pages, "u.pdf"))
    assert {(item.kind, item.date) for item in checklist.dates} == {
        ("annat", dt.date(2026, 10, 30)),
        ("sista_anbudsdag", dt.date(2026, 12, 1)),
    }


async def test_current_procedure_names_win_over_the_repealed_ones() -> None:
    pages = [
        "Förfarandet motsvarar det som tidigare kallades förenklat förfarande.\n"
        "Upphandlingen är ett öppet förfarande."
    ]
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, _set(pages, "u.pdf"))
    assert checklist.procedure == "Öppet förfarande"


# --- bedom_matchning ---------------------------------------------------------------------

PAINTER = CompanyProfile(
    name="Målerifirman (fiktiv)",
    description=(
        "Vi är en målerifirma i Matfors med fem anställda. Vi målar invändigt och utvändigt, tapetserar och "
        "renoverar fasader åt bostadsrättsföreningar och företag i Sundsvall och Timrå. Vi har inte lämnat "
        "anbud i en offentlig upphandling tidigare."
    ),
    cpv_codes=["45442100", "45442110"],
    municipalities=["Sundsvall", "Timrå"],
)


async def test_assess_match_ignores_procurement_words_and_place_names() -> None:
    notice = NoticeContext(
        notice_id="n2",
        title="Påsar och säckar för matavfall (fiktiv)",
        buyer="Timrå kommun, Ånge kommun",
        description=(
            "Upphandlingen är en gemensam länsupphandling för kommunerna Örnsköldsvik, Timrå, Sundsvall och "
            "Ånge. Anbud lämnas i e-Avrop."
        ),
        cpv_codes=["18930000", "90510000"],
    )
    assessment, _ = await HeuristicEngine().assess_match(PAINTER, notice, None)
    assert assessment.fit == "passar_inte"
    assert [reason.kind for reason in assessment.reasons] == ["hinder"]
    assert "ortnamn" in assessment.summary


async def test_assess_match_needs_cpv_for_a_full_fit() -> None:
    words_only = NoticeContext(
        notice_id="n3",
        title="Ommålning av fasader, invändig målning och tapetsering (fiktiv)",
        description="Fasader och väggar målas utvändigt och invändigt.",
    )
    assessment, _ = await HeuristicEngine().assess_match(PAINTER, words_only, None)
    assert assessment.fit == "passar_delvis"  # shared words, but no CPV codes to back them up

    group = words_only.model_copy(update={"cpv_codes": ["45454100"]})  # same CPV group (454)
    assessment, _ = await HeuristicEngine().assess_match(PAINTER, group, None)
    assert assessment.fit == "passar"
    assert [reason.kind for reason in assessment.reasons] == ["styrka", "styrka"]

    conflict = words_only.model_copy(update={"cpv_codes": ["90910000"]})
    assessment, _ = await HeuristicEngine().assess_match(PAINTER, conflict, None)
    assert assessment.fit == "passar_delvis"  # capped: the CPV codes point elsewhere
    assert assessment.reasons[0].kind == "hinder"


async def test_assess_match_needs_two_words_against_the_cpv_codes() -> None:
    notice = NoticeContext(
        notice_id="n4", title="Restaurering av fasad på skola (fiktiv)", cpv_codes=["71000000"]
    )
    assessment, _ = await HeuristicEngine().assess_match(PAINTER, notice, None)
    assert assessment.fit == "passar_inte"
    assert assessment.reasons[0].kind == "hinder"


@pytest.mark.parametrize(
    ("profile_codes", "notice_codes"),
    [
        (["45000000"], ["45442110"]),  # a division on the profile covers the specific notice
        (["45442100"], ["45000000"]),  # a division on the notice says too little
        (["45400000"], ["45401000"]),  # shared zeros are not shared digits
        (["45442100"], ["45111000"]),  # same division only
        (["45442100", "90911200"], ["90911300"]),
    ],
)
async def test_assess_match_reads_cpv_codes_like_the_matching_prefilter(
    profile_codes: list[str], notice_codes: list[str]
) -> None:
    profile = PAINTER.model_copy(update={"cpv_codes": profile_codes})
    notice = NoticeContext(notice_id="n5", title="Uppdrag (fiktiv)", cpv_codes=notice_codes)
    assessment, _ = await HeuristicEngine().assess_match(profile, notice, None)
    cpv_reasons = [reason for reason in assessment.reasons if "CPV" in reason.text]
    near = any(reason.kind == "styrka" for reason in cpv_reasons)
    # The engine calls the codes near exactly when matching's prefilter would admit them on CPV alone.
    assert near is (prefilter_score(profile_codes, notice_codes, None) is not None)


# --- what the profile says about the checklist's requirements ------------------------------

SILENT_PROFILE = CompanyProfile(name="Målerifirman (fiktiv)", description="Målning.", cpv_codes=["45442100"])


def _one_requirement(sentence: str, kind: RequirementKind = "kvalificeringskrav") -> Checklist:
    return Checklist(
        summary="s",
        requirements=[
            Requirement(
                id="K1",
                kind=kind,
                title=sentence,
                plain_language=sentence,
                citation=Citation(page=1, quote=sentence),
            )
        ],
    )


@pytest.mark.parametrize(
    ("sentence", "topic"),
    [
        ("Leverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor.", "försäkring"),
        ("Leverantören ska ha en produktansvarsförsäkring.", "försäkring"),
        ("Försäkringsbevis ska bifogas anbudet.", "försäkring"),
        ("Anbudsgivaren ska ha betalat skatter och socialförsäkringsavgifter.", None),
        ("Intyg från Försäkringskassan ska bifogas vid behov.", None),
        ("Anbudsgivaren ska redovisa två referensuppdrag.", "referensuppdrag"),
        ("Referenserna ska avse uppdrag åt offentliga beställare.", "referensuppdrag"),
        ("Fakturan ska ange kommunens referens.", None),
        ("Referenspriset ska justeras en gång per år.", None),
        ("Anbudsgivaren ska ha en årsomsättning om minst 2 000 000 kronor.", "företagets ekonomi"),
        ("Anbudsgivaren ska ha en så stabil ekonomi att uppdraget kan genomföras.", "företagets ekonomi"),
        ("Anbudsgivaren ska ha god ekonomisk och finansiell ställning.", "företagets ekonomi"),
        ("Kommunen ska anta det ekonomiskt mest fördelaktiga anbudet.", None),
        ("Leverantören ska redovisa personalomsättningen varje år.", None),
        ("Leverantören ska vara certifierad enligt ISO 9001.", "certifiering"),
    ],
)
async def test_requirement_topics_are_whole_words_not_look_alikes(sentence: str, topic: str | None) -> None:
    assessment, _ = await HeuristicEngine().assess_match(SILENT_PROFILE, NOTICE, _one_requirement(sentence))
    unclear = [reason.text for reason in assessment.reasons if reason.kind == "oklart"]
    expected = [f"Underlaget ställer krav på {topic}, men er profil säger inget om det."] if topic else []
    assert unclear == expected


async def test_a_requirement_on_the_company_is_cited_before_a_contract_term_on_the_same_topic() -> None:
    term = "Leverantören ska ha kvar sin ansvarsförsäkring under hela avtalstiden."
    requirement = "Leverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor."
    checklist = Checklist(
        summary="s",
        requirements=[
            *_one_requirement(term, "avtalsvillkor").requirements,
            _one_requirement(requirement).requirements[0].model_copy(update={"id": "K2"}),
        ],
    )
    profile = SILENT_PROFILE.model_copy(update={"insurance": "Ansvarsförsäkring 5 000 000 kronor"})
    assessment, _ = await HeuristicEngine().assess_match(profile, NOTICE, checklist)
    [insurance] = [reason for reason in assessment.reasons if reason.requirement_id]
    assert insurance.requirement_id == "K2"
    assert insurance.text == "Ni har angett en försäkring i profilen. Kontrollera att den räcker för kravet."


# --- reasons in the CPV list's words --------------------------------------------------------

LABELS = {
    "45442100": "Målning",
    "45442110": "Målning av byggnader",
    "45453100": "Renoveringsarbete",
    "90910000": "Rengöring",
    "72000000": "IT-tjänster: konsultverksamhet, programvaruutveckling, Internet och support",
}


def _labelled_profile(codes: list[str]) -> CompanyProfile:
    return PAINTER.model_copy(
        update={
            "cpv_codes": codes,
            "cpv_labels": {code: LABELS[code] for code in codes},
            "description": "Vi.",
        }
    )


def _labelled_notice(codes: list[str]) -> NoticeContext:
    return NoticeContext(
        notice_id="n6",
        title="Uppdrag (fiktiv)",
        cpv_codes=codes,
        cpv_labels={code: LABELS[code] for code in codes},
    )


@pytest.mark.parametrize(
    ("own", "theirs", "kind", "text"),
    [
        (["45442100"], ["45442110"], "styrka", "Upphandlingen gäller målning av byggnader – det gör ni."),
        (["45442110"], ["45442110"], "styrka", "Upphandlingen gäller målning av byggnader – det gör ni."),
        (
            ["45442100"],
            ["45453100"],
            "styrka",
            "Upphandlingen gäller renoveringsarbete, nära det ni gör (målning).",
        ),
        (
            ["90910000"],
            ["45442100"],
            "hinder",
            "Upphandlingen gäller målning, som inte ligger nära det ni gör enligt profilen.",
        ),
        (
            ["45442100"],
            ["72000000"],
            "hinder",
            "Upphandlingen gäller IT-tjänster: konsultverksamhet, programvaruutveckling, Internet och "
            "support, som inte ligger nära det ni gör enligt profilen.",
        ),
    ],
)
async def test_cpv_reasons_use_the_labels_never_bare_codes(
    own: list[str], theirs: list[str], kind: str, text: str
) -> None:
    assessment, _ = await HeuristicEngine().assess_match(
        _labelled_profile(own), _labelled_notice(theirs), None
    )
    assert (assessment.reasons[0].kind, assessment.reasons[0].text) == (kind, text)
    assert not any(code in reason.text for reason in assessment.reasons for code in [*own, *theirs])


async def test_cpv_reasons_without_labels_still_name_no_codes() -> None:
    profile = PAINTER.model_copy(update={"cpv_codes": ["45442100"], "description": "Vi."})
    assessment, _ = await HeuristicEngine().assess_match(profile, NOTICE, None)
    assert assessment.reasons[0].text == "Upphandlingens CPV-koder ligger nära era."
    assert "45442100" not in assessment.reasons[0].text


async def test_shared_words_are_listed_in_running_text() -> None:
    notice = NoticeContext(
        notice_id="n7", title="Ommålning av fasader och invändig målning (fiktiv)", cpv_codes=["45442100"]
    )
    assessment, _ = await HeuristicEngine().assess_match(PAINTER, notice, None)
    words = [reason.text for reason in assessment.reasons if reason.text.startswith("Ni och annonsen")]
    assert words == ["Ni och annonsen använder samma ord: fasader och invändig."]


# --- Published answers (decision 0018) -------------------------------------------------------


def _published(number: int, question: str, answer: str) -> PublishedAnswerInput:
    return PublishedAnswerInput(
        number=number,
        key=f"k{number}",
        question=question,
        answer=answer,
        answered_at=dt.datetime(2026, 10, 9, 10, 0, tzinfo=dt.UTC),
    )


F_SKATT = _published(
    1,
    "Gäller kravet på F-skattsedel även underleverantörer?",
    "Ja, kravet på F-skattsedel gäller även underleverantörer.",
)


async def test_a_nearly_identical_question_gets_inkops_answer_first() -> None:
    answer, _ = await HeuristicEngine().answer_question(
        NOTICE,
        DocumentSet.of([DOCUMENT]),
        "Gäller kravet på F-skattsedel även för underleverantörer?",
        [],
        [F_SKATT],
    )
    assert answer.answer.startswith("Inköp har svarat på en liknande fråga i e-Avrop:")
    assert [citation.answer for citation in answer.answer_citations] == [1]
    assert verify_answer(answer, [DOCUMENT], [F_SKATT]).answer_citations[0].check == "verified"


@pytest.mark.parametrize(
    "question",
    [
        "Gäller kravet på referenser även underleverantörer?",
        "Gäller kravet på ansvarsförsäkring även underleverantörer?",
        "Måste underleverantörer uppfylla kravet på miljöledningssystem?",
    ],
)
async def test_a_question_about_something_else_never_gets_that_answer(question: str) -> None:
    """The reader's distinctive word counts: an answer about F-skatt is not an answer about references."""

    answer, _ = await HeuristicEngine().answer_question(
        NOTICE, DocumentSet.of([DOCUMENT]), question, [], [F_SKATT]
    )
    assert answer.answer_citations == []


async def test_a_one_character_answer_is_quoted_by_its_question() -> None:
    short = _published(1, "Hur många utbildningstillfällen planeras totalt?", "5")
    answer, _ = await HeuristicEngine().answer_question(
        NOTICE, DocumentSet.of([DOCUMENT]), "Hur många utbildningstillfällen planeras?", [], [short]
    )
    assert answer.answer_citations[0].quote == "Hur många utbildningstillfällen planeras totalt?"


async def test_interpret_document_reads_every_document_and_names_the_attachment() -> None:
    attachment = PagedDocument(
        filename="6.6 Krav på entreprenör.pdf",
        pages=["Krav på entreprenören\nEntreprenören ska vara certifierad enligt ISO 14001."],
    )
    documents = DocumentSet.of([DOCUMENT, attachment], unread_files=["Prisbilaga.zip"])

    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, documents)

    iso = next(r for r in checklist.requirements if "ISO 14001" in r.citation.quote)
    assert (iso.citation.document, iso.citation.page) == ("6.6 Krav på entreprenör.pdf", 1)
    insurance = next(r for r in checklist.requirements if "ansvarsförsäkring" in r.citation.quote)
    assert (insurance.citation.document, insurance.citation.page) == ("underlag.pdf", 2)
    _, summary = verify_checklist(checklist, [DOCUMENT, attachment])
    assert summary.citations_verified == summary.citations_total
    assert checklist.summary.startswith(
        "Underlaget har 2 dokument med 4 sidor sammanlagt. 1 fil kunde inte läsas in här och är inte med: "
        "Prisbilaga.zip."
    )


EXPORT_PAGES = [
    "1 Krav på Leverantör\n"
    "1.1 Ekonomisk ställning\n"
    "Leverantören ska ha en rating motsvarande lägst Grön huvudrating.\n"
    "Kvalificeringskrav\n"
    "1.1.1 Leverantören bekräftar att ovanstående krav uppfylls.\n"
    "Ja\n"
    "Informationsfråga\n"
    "1.1.2 Leverantören ska ange vilka underleverantörer som anlitas.\n"
    "Svar\n"
    "1.2 Timpris\n"
    "Antal\n"
    "100\n"
    "Pris/h\n"
    "SEK",
]


async def test_an_eavrop_export_is_read_without_its_form_fields() -> None:
    documents = DocumentSet.of([PagedDocument(filename="Krav.pdf", pages=EXPORT_PAGES, layout="eavrop")])
    checklist, _ = await HeuristicEngine().interpret_document(NOTICE, documents)
    quotes = [requirement.citation.quote for requirement in checklist.requirements]
    # The requirement and the information question's demand; never a field or a confirmation.
    assert quotes == [
        "Leverantören ska ha en rating motsvarande lägst Grön huvudrating.",
        "1.1.2 Leverantören ska ange vilka underleverantörer som anlitas.",
    ]
    _, summary = verify_checklist(checklist, [PagedDocument(filename="Krav.pdf", pages=EXPORT_PAGES)])
    assert summary.citations_verified == summary.citations_total
    answer, _ = await HeuristicEngine().answer_question(NOTICE, documents, "Vilket timpris gäller?", [])
    assert not any(citation.quote in {"Ja", "Svar", "Antal", "100"} for citation in answer.citations)
