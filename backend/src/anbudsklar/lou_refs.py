"""How LOU sections are referred to, linked and quoted, shared by the API, the engines and MCP."""

from __future__ import annotations

import re

LOU_HTML_URL = "https://data.riksdagen.se/dokument/sfs-2016-1145.html"
EXCERPT_CHARS = 400
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-ZÅÄÖ])")


def lou_reference(chapter: str | int, section: str) -> str:
    """Human-readable reference, e.g. "LOU 19 a kap. 2 §"."""

    return f"LOU {chapter} kap. {section} §"


def lou_url(chapter: str | int, section: str) -> str:
    """Link to the section in Riksdagen's HTML edition.

    Its anchors are K{chapter}P{section} without spaces, e.g. K19aP3a for 19 a kap. 3 a §
    (checked against the HTML on 2026-10-05).
    """

    return f"{LOU_HTML_URL}#K{str(chapter).replace(' ', '')}P{section.replace(' ', '')}"


def lou_excerpt(text: str, limit: int = EXCERPT_CHARS) -> str:
    """The start of a section's text, cut after a whole sentence, with " …" when shortened.

    A reader can trust a whole sentence of law; half of one can say the opposite. Only a
    first sentence longer than `limit` is cut at a word. "13 kap. 1 §" is no sentence end,
    since a new sentence starts with a capital letter.
    """

    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    kept = ""
    for sentence in _SENTENCE_END.split(collapsed):
        longer = f"{kept} {sentence}".strip()
        if len(longer) > limit:
            break
        kept = longer
    if not kept:
        cut = collapsed.rfind(" ", 0, limit)
        kept = collapsed[: cut if cut > 0 else limit].rstrip(" ,;:")
    return f"{kept} …"
