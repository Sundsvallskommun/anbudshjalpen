"""Documents exported from e-Avrop: the footer, and the fields of its electronic forms.

The pages below are fictitious but shaped exactly like the exports stored on 2026-10-13:
a footer on every page, type labels before numbered items, and the fields a supplier
fills in on the web.
"""

from __future__ import annotations

from anbudsklar.contracts import EAVROP_LAYOUT, DocumentSet, PagedDocument
from anbudsklar.documents.eavrop_export import (
    detect_layout,
    is_answer_field,
    is_confirmation,
    prepare_for_rules,
    strip_footers,
)


def _footer(page: int, document: str = "Krav på Leverantör UH-2026-999") -> str:
    return (
        "Sundsvalls kommun\nUpphandling\nFiktiv upphandling\nDokument\n"
        f"{document}\nDiarienummer\nUH-2026-999\nDatum\n2026-10-07\n{page}"
    )


PAGE_1 = (
    "1 Krav på Leverantör\n"
    "1.1 Uteslutning av Leverantör\n"
    "Leverantören ska bekräfta att ingen av uteslutningsgrunderna i 13 kap 1-3 §§ LOU föreligger.\n"
    "Uteslutningsgrund\n"
    "1.1.1 Leverantören bekräftar att ovanstående krav uppfylls.\n"
    "Ja\n"
    "1.2 Ekonomisk och finansiell ställning\n"
    "Leverantören ska ha en rating motsvarande lägst Grön huvudrating.\n"
    "Kvalificeringskrav\n"
    "1.2.1 Leverantören bekräftar att ovanstående krav uppfylls.\n"
    "Ja\n"
    "Kvalificeringskrav\n"
    "1.2.2 Leverantören ska bifoga en beskrivning av sin organisation\n"
    "och kapacitet.\n"
    "Ingen fil bifogad\n"
    f"{_footer(1)}"
)
PAGE_2 = (
    "1.3 Åberopad kapacitet\n"
    "Kvalificeringskrav\n"
    "1.3.1 Åberopas andra företags kapacitet?\n"
    "Ja\n"
    "Nej\n"
    "Informationsfråga\n"
    "1.3.2 Om andra företags kapacitet åberopas, ange åberopat/åberopade\n"
    "företags namn.\n"
    "Svar\n"
    "1.4 Timpris\n"
    "Antal\n"
    "100\n"
    "Pris/h\n"
    "SEK\n"
    "Kommentar\n"
    "1.5 Försäkring\n"
    "Leverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor.\n"
    f"{_footer(2)}"
)
EXPORT = [PAGE_1, PAGE_2]


def test_the_footer_marks_an_export_and_is_stripped() -> None:
    assert detect_layout(EXPORT) == EAVROP_LAYOUT
    stripped = strip_footers(EXPORT)
    assert stripped[0].endswith("Ingen fil bifogad")
    assert stripped[1].endswith("5 000 000 kronor.")
    assert "Diarienummer" not in "\n".join(stripped)


def test_a_document_without_the_footer_on_most_pages_is_not_an_export() -> None:
    assert detect_layout(["Vanlig text.", "Mer text.", _footer(3)]) is None
    assert detect_layout(["", "   "]) is None
    assert strip_footers(["Vanlig text."]) == ["Vanlig text."]


def test_fields_labels_and_confirmations_are_recognised() -> None:
    assert is_answer_field("Ingen fil bifogad", None)
    assert is_answer_field("Pris/SEK", None)
    assert is_answer_field("100", "Antal")
    assert not is_answer_field("100", "Pris/h")  # a bare number is a quantity only after Antal
    assert not is_answer_field("Ja, vi erbjuder avgiftsfri leverans", None)  # an option, kept as text
    assert is_confirmation("1.2.1 Leverantören bekräftar att ovanstående krav uppfylls.")
    assert is_confirmation("2.1 Behörig företrädare intygar att ovan omständigheter föreligger.")
    assert not is_confirmation("1.2.2 Leverantören ska bifoga en beskrivning av sin organisation")


def test_prepare_for_rules_leaves_out_the_form_and_keeps_the_text_as_it_is() -> None:
    pages = prepare_for_rules(strip_footers(EXPORT), EAVROP_LAYOUT)

    def lines(page: str) -> list[str]:
        return [line for line in page.splitlines() if line]

    assert lines(pages[0]) == [
        "1 Krav på Leverantör",
        "1.1 Uteslutning av Leverantör",
        "Leverantören ska bekräfta att ingen av uteslutningsgrunderna i 13 kap 1-3 §§ LOU föreligger.",
        "1.2 Ekonomisk och finansiell ställning",
        "Leverantören ska ha en rating motsvarande lägst Grön huvudrating.",
        "1.2.2 Leverantören ska bifoga en beskrivning av sin organisation",
        "och kapacitet.",
    ]
    # The information question stays as text; the quantity after Antal goes; "Ja"/"Nej" go.
    assert lines(pages[1]) == [
        "1.3 Åberopad kapacitet",
        "1.3.1 Åberopas andra företags kapacitet?",
        "1.3.2 Om andra företags kapacitet åberopas, ange åberopat/åberopade",
        "företags namn.",
        "1.4 Timpris",
        "1.5 Försäkring",
        "Leverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor.",
    ]
    # Every line kept is verbatim and in place: a removed line leaves a blank, so a sentence
    # never runs across a gap, and quotes still verify against the stored page.
    for prepared, original in zip(pages, strip_footers(EXPORT), strict=True):
        assert len(prepared.split("\n")) == len(original.split("\n"))
        assert all(line in original for line in lines(prepared))
    assert prepare_for_rules(EXPORT, None) == EXPORT


def test_the_outline_explains_the_layout_to_the_model() -> None:
    documents = DocumentSet.of(
        [
            PagedDocument(filename="AF.pdf", pages=["Vanlig text."]),
            PagedDocument(filename="Krav.pdf", pages=["Krav."], layout=EAVROP_LAYOUT),
            PagedDocument(filename="Kravspec.pdf", pages=["Krav."], layout=EAVROP_LAYOUT),
        ]
    )
    rendered = documents.render()
    assert "Dokument 2, 3: Dokumentet är exporterat ur e-Avrop" in rendered
    assert "citera kravets egen text, aldrig fälten" in rendered
    assert rendered.count("exporterat ur e-Avrop") == 1
    assert "exporterat" not in DocumentSet.of([PagedDocument(filename="AF.pdf", pages=["x"])]).render()


def test_a_confirmation_ends_at_its_field_and_an_information_question_keeps_its_demand() -> None:
    """Seen in a real export: an information question that says what must be attached."""

    page = (
        "Kvalificeringskrav\n"
        "2.1 Behörig företrädare intygar att ovan omständigheter\n"
        "föreligger.\n"
        "Ja\n"
        "Informationsfråga\n"
        "2.2 Om ni svarat ja ovan, beskriv hur leveranserna genomförs. En fordonsförteckning\n"
        "där drivmedel framgår ska bifogas.\n"
        "Ingen fil bifogad\n"
        "Texten efter fältet hör till underlaget.\n"
    )
    assert [line for line in prepare_for_rules([page], EAVROP_LAYOUT)[0].splitlines() if line] == [
        "2.2 Om ni svarat ja ovan, beskriv hur leveranserna genomförs. En fordonsförteckning",
        "där drivmedel framgår ska bifogas.",
        "Texten efter fältet hör till underlaget.",
    ]
