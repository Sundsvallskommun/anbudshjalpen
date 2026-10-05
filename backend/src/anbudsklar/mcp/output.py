"""Formatting and size budgeting for MCP tool results.

Eneo's MCP client sets these rules: text blocks are joined with "" and placed before the
resources; every resource with a uri becomes a citation whose text is cut at 8 KiB of
UTF-8; a result over 32 768 serialized characters is cut. Tools therefore stay below
`settings.mcp_max_output_chars` themselves and say how to fetch the rest, instead of
letting Eneo cut silently.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import date, datetime
from zoneinfo import ZoneInfo

from mcp.types import EmbeddedResource, TextContent, TextResourceContents
from pydantic import AnyUrl

from anbudsklar.contracts import Citation

Content = TextContent | EmbeddedResource

RESOURCE_TEXT_MAX_BYTES = 7_500  # Eneo cuts resource text at 8 KiB of UTF-8
HEADER_RESERVE_CHARS = 1_200  # kept free for the header and the continuation hint
STOCKHOLM = ZoneInfo("Europe/Stockholm")
MISSING = "uppgift saknas"


def text_block(text: str) -> TextContent:
    """A text block ending in a newline, because Eneo joins text blocks with ""."""

    return TextContent(type="text", text=with_newline(text))


def with_newline(text: str) -> str:
    return text if text.endswith("\n") else text + "\n"


def resource_block(
    *, uri: str, title: str, body: str, page_range: str | None = None, section: str | None = None
) -> EmbeddedResource:
    """A citable source for Eneo.

    The model sees only `body`, never the uri or `_meta`, so the body must name its own
    source (document and page, or law reference). `_meta` labels Eneo's reference chip.
    """

    meta: dict[str, str] = {"title": title}
    if page_range:
        meta["pageRange"] = page_range
    if section:
        meta["section"] = section
    contents = TextResourceContents(
        uri=AnyUrl(uri),
        mimeType="text/plain",
        text=cap_utf8(body, RESOURCE_TEXT_MAX_BYTES),
        _meta=meta,
    )
    return EmbeddedResource(type="resource", resource=contents)


def block_size(block: Content) -> int:
    """Serialized size of a block, plus the list separator, as Eneo measures it."""

    return len(block.model_dump_json(by_alias=True, exclude_none=True)) + 2


def line_size(line: str) -> int:
    """Escaped length of a line in a JSON string; the quotes stand in for the newline."""

    return len(json.dumps(line, ensure_ascii=False))


def fit_count(sizes: Sequence[int], budget: int) -> int:
    """How many leading items fit in the budget once the header reserve is taken.

    At least one item is always kept, so following a continuation hint makes progress
    even with a very small budget.
    """

    available = budget - HEADER_RESERVE_CHARS
    used = 0
    for index, size in enumerate(sizes):
        if used + size > available:
            return max(index, 1)
        used += size
    return len(sizes)


def fit_lines(lines: Sequence[str], budget: int) -> int:
    return fit_count([line_size(line) for line in lines], budget)


def fit_blocks(blocks: Sequence[Content], budget: int) -> int:
    return fit_count([block_size(block) for block in blocks], budget)


def count(number: int, singular: str, plural: str) -> str:
    """'1 träff', '3 träffar': Swedish needs the right form in headers the model repeats."""

    return f"{number} {singular if number == 1 else plural}"


def more_hint(parameter: str, value: int, what: str = "träffar") -> str:
    """The continuation marker every paginated tool ends with."""

    return f"… (fler {what}: anropa igen med {parameter}={value})"


def shorten(text: str, max_chars: int) -> str:
    """Cut long free text at a word boundary and mark the cut."""

    text = " ".join(text.split())
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0]
    return f"{cut} […]"


def cap_utf8(text: str, max_bytes: int) -> str:
    raw = text.encode("utf-8")
    if len(raw) <= max_bytes:
        return text
    return raw[:max_bytes].decode("utf-8", errors="ignore") + " […]"


def format_datetime(value: datetime | None) -> str:
    """Swedish local time; deadlines are stored in UTC."""

    if value is None:
        return MISSING
    local = value.astimezone(STOCKHOLM)
    return local.strftime("%Y-%m-%d kl. %H:%M")


def format_date(value: date | None) -> str:
    return value.isoformat() if value else MISSING


def format_sek(value: int | None) -> str:
    if value is None:
        return MISSING
    return f"{value:,}".replace(",", " ") + " kr"


def citation_text(citation: Citation) -> str:
    """Page, verification status and quote, as shown next to a claim.

    A quote that verification found on another page is cited with the page where it was
    found, which is the correct one.
    """

    page = citation.found_page if citation.check == "moved" and citation.found_page else citation.page
    status = {
        "verified": "kontrollerat",
        "moved": "kontrollerat",
        "unverified": "kunde inte kontrolleras",
    }.get(citation.check or "", "inte kontrollerat")
    return f's. {page} ({status}): "{citation.quote}"'
