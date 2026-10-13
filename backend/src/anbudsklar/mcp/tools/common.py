"""Parameter types and lookups shared by the MCP tools.

Parameter names are Swedish ASCII snake_case and every parameter has a Swedish
description, because the model writes its search terms in the language the schema
primes, and Postgres full-text search uses the Swedish configuration. Schemas stay flat
(no nested models, so no `$defs`), which every LLM provider behind Eneo accepts.

Limits in the schemas guide the model, but a value just outside them is brought inside
in code (`clamped`, `trimmed`, `code_list`) instead of failing the call: each rejected
call costs a round trip, and the schema itself must not change without an Eneo re-sync.
"""

from __future__ import annotations

import re
from typing import Annotated

from mcp.types import ToolAnnotations
from pydantic import BeforeValidator, Field
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.cpv import cpv_prefix as code_prefix
from anbudsklar.mcp.context import parse_id
from anbudsklar.mcp.guidance import ToolGuidance
from anbudsklar.mcp.reads import get_notice
from anbudsklar.models import Document, Notice

READ_ONLY = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
)

_CODE_SEPARATORS = re.compile(r"[\s,;]+")


def _whole_number(value: object) -> int | None:
    """The whole number in `value`, or None to leave the value for pydantic to judge."""

    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def clamped(low: int, high: int | None = None) -> BeforeValidator:
    """Bring a number into [low, high]: limit=50 gives the 25 allowed, fran_sida=0 gives 1.

    The tools' headers say what was returned, so the model sees the adjusted value.
    """

    def clamp(value: object) -> object:
        number = _whole_number(value)
        if number is None:
            return value
        number = max(number, low)
        return number if high is None else min(number, high)

    return BeforeValidator(clamp)


def trimmed(max_chars: int, *, blank_is_none: bool = False) -> BeforeValidator:
    """Strip surrounding space and cut over-long search text at the schema's limit."""

    def trim(value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value.strip()
        if blank_is_none and not text:
            return None
        return _cut_at_word(text, max_chars)

    return BeforeValidator(trim)


def _cut_at_word(text: str, max_chars: int) -> str:
    """Cut before a half word: full-text search ANDs its terms, so a broken one matches nothing."""

    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    if not text[max_chars].isspace() and len(cut.split()) > 1:
        cut = cut.rsplit(None, 1)[0]
    return cut.rstrip()


def _code_list(value: object) -> object:
    """Accept '4544' or '4544, 4545' where a list of codes is expected, and strip each code."""

    if isinstance(value, str):
        value = _CODE_SEPARATORS.split(value)
    if isinstance(value, list):
        items = [item.strip() if isinstance(item, str) else item for item in value]
        return [item for item in items if item != ""]
    return value


code_list = BeforeValidator(_code_list)

UpphandlingId = Annotated[
    str,
    Field(
        description="upphandling_id från sok_upphandlingar eller hamta_upphandling.",
        min_length=1,
        max_length=64,
    ),
]
CpvKoder = Annotated[
    list[Annotated[str, Field(pattern=r"^\d{2,8}(-\d)?$")]] | None,
    Field(
        description=(
            "CPV-koder eller prefix, t.ex. ['45442100'] eller ['4544']. Ett kortare prefix ger fler träffar. "
            "Hitta koder med sla_upp_cpv."
        ),
        max_length=10,
    ),
    code_list,
]
Offset = Annotated[
    int,
    Field(description="Hoppa över så många rader. Använd värdet från fortsättningsraden.", ge=0, le=10_000),
    clamped(0, 10_000),
]

NOTICE_STATUS_LABELS = {
    "open": "öppen, går att lämna anbud",
    "planned": "planerad, inte annonserad än",
    "closed": "avslutad",
    "awarded": "tilldelad",
}
# An open restricted procedure takes requests to participate, not tenders, until its deadline.
OPEN_FOR_REQUESTS_LABEL = "öppen, går att lämna anbudsansökan"
FICTITIOUS_NOTICE = "FIKTIV UPPHANDLING – endast för demonstration"


def cpv_prefix(value: str) -> str:
    """Hierarchy prefix of a full code ("45440000" -> "4544") or a prefix as typed ("4544")."""

    digits = value.strip().split("-")[0]
    return code_prefix(digits) if len(digits) == 8 else digits


def cpv_overlaps(codes: list[str], filters: list[str]) -> bool:
    """True when a code lies under a filter or the filter lies under the code (same branch)."""

    own = [cpv_prefix(code) for code in codes]
    wanted = [cpv_prefix(value) for value in filters]
    return any(a.startswith(b) or b.startswith(a) for a in own for b in wanted)


async def require_notice(session: AsyncSession, upphandling_id: str) -> Notice:
    notice_id = parse_id(upphandling_id, field="upphandling_id", where="sok_upphandlingar")
    notice = await get_notice(session, notice_id)
    if notice is None:
        raise ToolGuidance(
            f"Hittar ingen upphandling med upphandling_id {upphandling_id}. "
            "Sök fram rätt id med sok_upphandlingar."
        )
    return notice


def document_line(document: Document) -> str:
    line = f"- dokument_id: {document.id} | {document.filename} | {document.page_count} sidor"
    if document.empty_pages:
        line += f" | {document.empty_pages} sidor utan läsbar text (bilder eller inskannade sidor)"
    return line


def notice_label(notice: Notice) -> str:
    """How tools name a notice in headers, so the model can name it in its answer."""

    marker = f" ({FICTITIOUS_NOTICE})" if notice.is_fictitious else ""
    return f"{notice.title} (upphandling_id {notice.id}){marker}"
