"""Documents exported from e-Avrop: the page footer, and the fields of its electronic forms.

Sundsvalls kommun writes most of its procurement documents inside e-Avrop, which exports
them as PDF with a footer on every page ("Sundsvalls kommun / Upphandling / … / Dokument /
… / Diarienummer / … / Datum / …" and the page number). The requirement documents are
electronic forms (kravmodulen): each requirement is followed by the fields a supplier
fills in on the web ("Leverantören bekräftar att ovanstående krav uppfylls." with "Ja",
"Svar", "Kommentar", "Ingen fil bifogad", "Antal" and a price), and a line before a
numbered item names its type (Kvalificeringskrav, Informationsfråga, Uteslutningsgrund …).

The footer is repeated metadata and is stripped from the stored text. The form lines are
kept, because a citation must be found in the page as the reader sees it, but
`prepare_for_rules` hides the fields, the type labels and the confirmation items from the
rule-based engine, and `LAYOUT_NOTES` explains them to a language model. An information
question keeps its text: what it asks for must be given in the tender, so "En
fordonsförteckning ska bifogas" inside one is a requirement like any other. Everything
here is pure text handling, checked against the exports stored on 2026-10-13.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from anbudsklar.contracts import EAVROP_LAYOUT

# The footer closes every page: the organisation, four labelled values and the page number.
_FOOTER = re.compile(
    r"(?:^|\n)[^\n]+\nUpphandling\n[^\n]+\nDokument\n[^\n]+\nDiarienummer\n[^\n]+\nDatum\n"
    r"\d{4}-\d{2}-\d{2}\n\d{1,4}\s*$"
)
# At least this share of the pages with text must end with the footer: an e-Avrop export
# has it on every page, and a document that merely quotes one should not be mistaken for one.
_FOOTER_SHARE = 0.5

# The fields a supplier fills in, as the export prints them on lines of their own.
ANSWER_FIELDS = frozenset(
    {
        "Ja",
        "Nej",
        "Svar",
        "Kommentar",
        "Ingen fil bifogad",
        "Antal",
        "SEK",
        "Uppfyller ni kravet?",
        "Ange svar i textfältet nedan",
    }
)
_PRICE_FIELD = re.compile(r"^Pris/\S+$")
# The type of the numbered item that follows, as e-Avrop's kravmodul names them.
TYPE_LABELS = frozenset(
    {
        "Kvalificeringskrav",
        "Skakrav",
        "Ska-krav",
        "Utvärderingskrav",
        "Börkrav",
        "Bör-krav",
        "Informationsfråga",
        "Uteslutningsgrund",
        "Prisfråga",
    }
)
_NUMBERED_ITEM = re.compile(r"^\d+(?:\.\d+)*\s+\S")
# "1.3.1.1 Leverantören bekräftar att ovanstående krav uppfylls." and "Behörig företrädare
# intygar att ovan omständigheter föreligger.": the confirmation field under a requirement.
_CONFIRMATION = re.compile(
    r"^\d+(?:\.\d+)*\s+(?:\S+\s+){1,3}?(?:bekräftar|intygar)\s+att\s+ovan", re.IGNORECASE
)


def detect_layout(pages: Sequence[str]) -> str | None:
    """`EAVROP_LAYOUT` when the pages carry e-Avrop's footer, else None."""

    with_text = [page for page in pages if page.strip()]
    if not with_text:
        return None
    footers = sum(1 for page in with_text if _FOOTER.search(page))
    return EAVROP_LAYOUT if footers / len(with_text) >= _FOOTER_SHARE else None


def strip_footers(pages: Sequence[str]) -> list[str]:
    """The pages without the footer block, which says the same on every page."""

    return [_FOOTER.sub("", page).rstrip() for page in pages]


def is_answer_field(line: str, previous: str | None) -> bool:
    """Whether a line is a field the supplier fills in; a bare number is one after "Antal"."""

    text = line.strip()
    if text in ANSWER_FIELDS or _PRICE_FIELD.match(text):
        return True
    return text.isdigit() and previous == "Antal"


def is_type_label(line: str) -> bool:
    return line.strip() in TYPE_LABELS


def is_confirmation(line: str) -> bool:
    return _CONFIRMATION.match(line.strip()) is not None


def _prepare_page(page: str) -> str:
    """One page without its form lines: the fields, the type labels and the confirmation items."""

    # A removed line leaves a blank one, so the rules never join the text before it to the
    # text after it into a sentence that is not on the page.
    kept: list[str] = []
    previous: str | None = None
    # A confirmation item runs until its own answer field, the next label or the next
    # numbered item, never into the text after it.
    skipping_item = False
    for line in page.splitlines():
        text = line.strip()
        if not text:
            kept.append(line)
            continue
        if is_answer_field(text, previous) or is_type_label(text):
            skipping_item = False
            previous = text
            kept.append("")
            continue
        if _NUMBERED_ITEM.match(text):
            skipping_item = is_confirmation(text)
        if skipping_item:  # the confirmation item and the wrapped rest of it
            previous = text
            kept.append("")
            continue
        kept.append(line)
        previous = text
    return "\n".join(kept)


def prepare_for_rules(pages: Sequence[str], layout: str | None) -> list[str]:
    """The pages as the rule-based engine should read them.

    For an e-Avrop export the form lines are blanked, so that "Ja" never becomes a
    sentence and a confirmation field never a requirement; page numbers are kept, and the
    lines that remain are unchanged and in place, so every quote still verifies against the
    stored page. Other layouts are returned as they are.
    """

    if layout != EAVROP_LAYOUT:
        return list(pages)
    return [_prepare_page(page) for page in pages]
