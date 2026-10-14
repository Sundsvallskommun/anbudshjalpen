"""How sections of the municipality's steering documents are referred to, linked and labelled."""

from __future__ import annotations

from datetime import date

import pytest

from anbudsklar.policy_refs import parse_policy_reference, policy_note, policy_reference, policy_url


def test_reference_and_url() -> None:
    assert policy_reference("Inköpsstrategin", "5.2") == "Inköpsstrategin 5.2"
    assert policy_url("https://sundsvall.se/download/strategi.pdf", 8) == (
        "https://sundsvall.se/download/strategi.pdf#page=8"
    )


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Inköpsstrategin 5.2", ("Inköpsstrategin", "5.2")),
        ("inköpsstrategin, avsnitt 5.2", ("inköpsstrategin", "5.2")),
        ("Inköpsstrategin avsnitt 6.1.1", ("Inköpsstrategin", "6.1.1")),
        ("Inköpsstrategin 5.2 Hållbara inköp", ("Inköpsstrategin", "5.2")),
        ("kommunens inköpsstrategi 3", ("kommunens inköpsstrategi", "3")),
        ("5.2", (None, "5.2")),
        ("avsnitt 5.2", (None, "5.2")),
        (" 5.2. ", (None, "5.2")),
    ],
)
def test_parses_references_with_and_without_a_document_name(
    text: str, expected: tuple[str | None, str]
) -> None:
    assert parse_policy_reference(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "4 kap. 1 §",
        "LOU 20 kap. 1 §",
        "20:1 §",
        "4 kap. 1",
        "Upphandlingsmyndigheten: Lämna anbud",
        "5 tips för anbud",  # a bare number followed by words is a question, not a reference
        "",
    ],
)
def test_law_references_and_plain_text_are_not_sections(text: str) -> None:
    assert parse_policy_reference(text) is None


def test_note_says_what_the_source_is_and_who_decided_it() -> None:
    assert policy_note("Kommunfullmäktige", date(2023, 9, 25)) == (
        "Kommunens styrdokument, fastställt av kommunfullmäktige 2023-09-25."
    )
    assert policy_note(None, date(2023, 9, 25)) == "Kommunens styrdokument, fastställt 2023-09-25."
    assert policy_note("Kommunstyrelsen", None) == "Kommunens styrdokument."
