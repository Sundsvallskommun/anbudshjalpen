"""Section classification of procurement document pages."""

from __future__ import annotations

import pytest

from anbudsklar.documents.sections import classify_pages, classify_section


@pytest.mark.parametrize(
    ("page", "expected"),
    [
        ("Förfrågningsunderlag\n1 Administrativa föreskrifter\n1.1 Om upphandlingen", "administrativa"),
        ("FIKTIVT UNDERLAG\n2. Kvalificering\nAnbudsgivaren ska vara registrerad.", "kvalificering"),
        ("3.2 Krav på leverantören\nLeverantören ska ha F-skatt.", "kvalificering"),
        ("4 Kravspecifikation\nArbetet omfattar invändig målning.", "kravspecifikation"),
        ("Beskrivning av uppdraget\nStädning av tolv förskolor.", "kravspecifikation"),
        ("5 Utvärdering av anbud\nAnbuden utvärderas på pris och kvalitet.", "utvardering"),
        ("Tilldelningsgrund\nBästa förhållandet mellan pris och kvalitet.", "utvardering"),
        ("6 Kommersiella villkor\nAvtalet gäller i två år.", "avtalsvillkor"),
        ("AVTALSVILLKOR\nFakturering sker månadsvis.", "avtalsvillkor"),
        ("7 Bilagor\nBilaga 1 Prisbilaga\nBilaga 2 Referensblankett", "bilagor"),
        ("Bilaga 3 Referensblankett\nUppdragsgivare:", "bilagor"),
        ("Bilaga 1 Prisbilaga\nTimpris för målare, kr/tim exkl. moms", "prisbilaga"),
    ],
)
def test_headings_decide_the_section(page: str, expected: str) -> None:
    assert classify_section(page) == expected


def test_table_of_contents_has_no_section() -> None:
    page = "Innehållsförteckning\n1 Administrativa föreskrifter 3\n2 Kvalificering 5\n3 Kravspecifikation 8"
    assert classify_section(page) is None


def test_vocabulary_decides_without_a_heading() -> None:
    page = (
        "Leverantören ska ha F-skatt och vara registrerad i aktiebolagsregistret. "
        "Leverantören ska ha en ansvarsförsäkring och minst två referensuppdrag. "
        "Sanningsförsäkran ska lämnas, och kreditupplysning tas."
    )
    assert classify_section(page) == "kvalificering"


def test_current_procedure_names_count_as_administrative_vocabulary() -> None:
    page = (
        "Upphandlingen är en annonserad upphandling enligt 19 kap. LOU och görs i e-Avrop. "
        "Sista anbudsdag och frågestopp står i tidsplanen."
    )
    assert classify_section(page) == "administrativa"


def test_page_without_signal_has_no_section() -> None:
    assert classify_section("Detta är en sida med allmän text om kommunen.") is None


def test_sentence_mentioning_a_section_word_is_not_a_heading() -> None:
    page = "Anbud som inte uppfyller kraven går inte vidare till utvärdering\nav anbuden och förkastas"
    assert classify_section(page) is None


def test_pages_without_heading_continue_the_running_section() -> None:
    pages = [
        "Förfrågningsunderlag Solbacken",
        "Innehåll\n1 Administrativa föreskrifter\n2 Kvalificering",
        "1 Administrativa föreskrifter\nSista anbudsdag 2026-11-14.",
        "Fortsättning av texten om anbudets form.",
        "Mer text.\n2 Kvalificering\nAnbudsgivaren ska ha F-skatt.",
        "Fortsatt text om referenser.",
        "3 Utvärdering\nPris 70 %.",
    ]
    assert classify_pages(pages) == [
        None,
        None,
        "administrativa",
        "administrativa",
        "kvalificering",
        "kvalificering",
        "utvardering",
    ]
