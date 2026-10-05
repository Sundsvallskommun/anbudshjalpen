"""Pure scoring functions of the quality test."""

from __future__ import annotations

from anbudsklar.api.schemas import VerificationSummary
from anbudsklar.contracts import Citation, Requirement
from anbudsklar.eval.scoring import (
    FacitItem,
    Scores,
    combine,
    match_requirements,
    page_distance,
    score_document,
    text_score,
)


def _facit(
    item_id: str, page: int, fragment: str, title: str = "Krav", kind: str = "kvalificeringskrav"
) -> FacitItem:
    return FacitItem(id=item_id, kind=kind, page=page, quote_fragment=fragment, title=title)


def _requirement(
    requirement_id: str,
    page: int,
    quote: str,
    title: str = "Något annat",
    kind: str = "kvalificeringskrav",
    found_page: int | None = None,
) -> Requirement:
    return Requirement(
        id=requirement_id,
        kind=kind,  # type: ignore[arg-type]
        title=title,
        plain_language="p",
        citation=Citation(page=page, quote=quote, found_page=found_page),
    )


INSURANCE = _facit("F1", 2, "ansvarsförsäkring om minst 5 000 000 kronor", "Ansvarsförsäkring")
FSKATT = _facit("F2", 2, "registrerad för F-skatt", "F-skatt")


def test_text_score_prefers_the_quote_and_ignores_case_and_dashes() -> None:
    requirement = _requirement("K1", 2, "Leverantören ska ha en ANSVARSFÖRSÄKRING om minst 5 000 000 kronor.")
    score, basis = text_score(INSURANCE, requirement)
    assert (score, basis) == (100.0, "citat")


def test_text_score_falls_back_to_the_title() -> None:
    requirement = _requirement("K1", 2, "Se avsnitt 3.2 för detaljer om skyddet.", title="Ansvarsförsäkring")
    assert text_score(INSURANCE, requirement)[1] == "rubrik"
    unrelated = _requirement("K2", 2, "Anbudet ska vara skrivet på svenska.", title="Språk")
    assert text_score(INSURANCE, unrelated)[1] is None


def test_page_distance_also_uses_the_verified_page() -> None:
    requirement = _requirement("K1", 5, "x" * 20, found_page=2)
    assert page_distance(INSURANCE, requirement) == 0


def test_matching_is_one_to_one_and_respects_page_tolerance() -> None:
    both = _requirement(
        "K1",
        2,
        "Leverantören ska vara registrerad för F-skatt och ha ansvarsförsäkring om minst 5 000 000 kronor.",
    )
    fskatt = _requirement("K2", 2, "Leverantören ska vara registrerad för F-skatt.")
    far_away = _requirement("K3", 5, "Leverantören ska ha ansvarsförsäkring om minst 5 000 000 kronor.")
    matches = match_requirements([INSURANCE, FSKATT], [both, fskatt, far_away])
    assert [(match.facit.id, match.requirement.id if match.requirement else None) for match in matches] == [
        ("F1", "K1"),
        ("F2", "K2"),
    ]


def test_unmatched_facit_items_are_reported() -> None:
    matches = match_requirements([INSURANCE], [])
    assert matches[0].requirement is None
    assert matches[0].basis is None


def test_score_document_and_combine() -> None:
    matched = _requirement("K1", 2, "Leverantören ska vara registrerad för F-skatt.", kind="skallkrav")
    extra = _requirement("K2", 3, "Anbudet ska vara skrivet på svenska.")
    matches = match_requirements([FSKATT, INSURANCE], [matched, extra])
    verification = VerificationSummary(citations_total=4, citations_verified=3, citations_unverified=1)
    scores = score_document(matches, [matched, extra], verification)
    assert (scores.facit_total, scores.extracted_total, scores.matched, scores.kind_matches) == (2, 2, 1, 0)
    assert (scores.recall, scores.precision, scores.kind_agreement, scores.citation_rate) == (
        0.5,
        0.5,
        0.0,
        0.75,
    )

    total = combine([scores, Scores(facit_total=2)])
    assert (total.facit_total, total.matched, total.recall) == (4, 1, 0.25)
    assert "recall" in total.model_dump()


def test_rates_are_undefined_without_data() -> None:
    empty = Scores()
    assert (empty.recall, empty.precision, empty.kind_agreement, empty.citation_rate) == (
        None,
        None,
        None,
        None,
    )
