"""How sections of the municipality's steering documents are referred to, linked and quoted.

Shared by the API, the engines and MCP, as `lou_refs` is for the law. A steering
document (styrdokument) binds the municipality's own purchasers, not the supplier, so
every place that shows one labels it "Kommunens styrdokument" (decision 0022).
"""

from __future__ import annotations

import re
from datetime import date

POLICY_LABEL = "Kommunens styrdokument"
_NUMBER = r"\d+(?:\.\d+)*"
# "Inköpsstrategin 5.2", "inköpsstrategin, avsnitt 5.2", "avsnitt 5.2", "5.2 Hållbara inköp".
_REFERENCE = re.compile(
    rf"^\s*(?P<name>[^\d§]*?)\s*(?:\bavsnitt\b\.?)?\s*(?P<number>{_NUMBER})(?P<rest>.*)$",
    re.IGNORECASE | re.DOTALL,
)
_LAW_WORDS = re.compile(r"§|\bkap\b", re.IGNORECASE)


def policy_reference(short_title: str, number: str) -> str:
    """Human-readable reference, e.g. "Inköpsstrategin 5.2"."""

    return f"{short_title} {number}"


def policy_url(source_url: str, page: int) -> str:
    """The PDF opened at the section's first page; `#page=N` is what the common viewers read."""

    return f"{source_url}#page={page}"


def parse_policy_reference(text: str) -> tuple[str | None, str] | None:
    """(document name or None, section number) from a reference, or None for anything else.

    The name is whatever precedes the number ("Inköpsstrategin"); None when only the
    number was given, which means the one document there is. A law reference ("4 kap.
    1 §", "20:1 §") is never read as a section of a steering document.
    """

    if _LAW_WORDS.search(text):
        return None
    match = _REFERENCE.match(text)
    if match is None or _LAW_WORDS.search(match["rest"]):
        return None
    name = match["name"].strip(" ,:;–-")
    if not name or name.lower() == "avsnitt":
        # A bare number followed by words ("5 tips för anbud") is a question, not a reference.
        return (None, match["number"]) if not match["rest"].strip(" .,;:") else None
    return name, match["number"]


def policy_note(decided_by: str | None, decided_on: date | None) -> str:
    """The line under a source card that says what kind of source this is and who decided it."""

    note = POLICY_LABEL
    if decided_by and decided_on:
        note += f", fastställt av {decided_by[:1].lower()}{decided_by[1:]} {decided_on.isoformat()}"
    elif decided_on:
        note += f", fastställt {decided_on.isoformat()}"
    return note + "."
