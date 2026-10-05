"""How LOU sections are referred to and linked, shared by the API and the MCP tools."""

from __future__ import annotations

LOU_HTML_URL = "https://data.riksdagen.se/dokument/sfs-2016-1145.html"


def lou_reference(chapter: str | int, section: str) -> str:
    """Human-readable reference, e.g. "LOU 19 a kap. 2 §"."""

    return f"LOU {chapter} kap. {section} §"


def lou_url(chapter: str | int, section: str) -> str:
    """Link to the section in Riksdagen's HTML edition.

    Its anchors are K{chapter}P{section} without spaces, e.g. K19aP3a for 19 a kap. 3 a §
    (checked against the HTML on 2026-10-05).
    """

    return f"{LOU_HTML_URL}#K{str(chapter).replace(' ', '')}P{section.replace(' ', '')}"
