"""The published checklist for a notice, as cited markdown lines.

Only checklists that inköp has reviewed and published are shown. A draft has not passed
the human review checkpoint and must never reach a company through an assistant.
"""

from __future__ import annotations

from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from anbudsklar.contracts import Checklist
from anbudsklar.mcp.context import ToolContext
from anbudsklar.mcp.output import (
    MISSING,
    citation_text,
    count,
    fit_lines,
    format_date,
    format_datetime,
    more_hint,
)
from anbudsklar.mcp.reads import get_document, latest_published_checklist
from anbudsklar.mcp.tools.common import READ_ONLY, Offset, UpphandlingId, notice_label, require_notice
from anbudsklar.models import ChecklistRecord, Document, Notice

ChecklistPart = Literal["alla", "datum", "krav", "bilagor", "utvardering", "begrepp"]
Avsnitt = Annotated[
    ChecklistPart,
    Field(
        description=(
            "Vilken del som visas: datum, krav (skallkrav och andra krav), bilagor, utvardering, begrepp "
            "eller alla (standard)."
        )
    ),
]

_REQUIREMENT_KINDS = {
    "skallkrav": "skallkrav",
    "kvalificeringskrav": "kvalificeringskrav",
    "krav_pa_uppdraget": "krav på uppdraget",
    "avtalsvillkor": "avtalsvillkor",
}
_DATE_KINDS = {
    "fragestopp": "Frågestopp",
    "sista_anbudsdag": "Sista anbudsdag",
    "anbudets_giltighet": "Anbudets giltighetstid",
    "tilldelning": "Tilldelning",
    "avtalsstart": "Avtalsstart",
    "annat": "Övrigt datum",
}
_PART_TITLES = {
    "datum": "Viktiga datum",
    "krav": "Krav",
    "bilagor": "Bilagor som ska lämnas",
    "utvardering": "Utvärdering",
    "begrepp": "Begrepp",
    "oklart": "Oklart i underlaget",
}


def register(server: FastMCP, ctx: ToolContext) -> None:
    @server.tool(
        name="hamta_checklista",
        title="Hämta checklista",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Hämta checklistan för en upphandling: skallkrav och andra krav, bilagor som ska lämnas, "
            "utvärdering, viktiga datum och begrepp, var och en med sida och ordagrant citat ur underlaget. "
            "Visar bara checklistor som inköp har granskat och publicerat. Använd när användaren vill veta "
            "vad som krävs för att lämna anbud. Ange sidnummer när du återger ett krav. Är citatet inte "
            "kontrollerat, läs sidan med lasa_sidor innan du använder det."
        ),
    )
    async def hamta_checklista(
        upphandling_id: UpphandlingId, avsnitt: Avsnitt = "alla", offset: Offset = 0
    ) -> str:
        async with ctx.session() as session:
            notice = await require_notice(session, upphandling_id)
            record = await latest_published_checklist(session, notice.id)
            if record is None:
                return (
                    f"Det finns ingen publicerad checklista för {notice_label(notice)} ännu. Inköp granskar "
                    "checklistor innan de publiceras. Svara direkt från underlaget med sok_i_underlag och "
                    "lasa_sidor.\n"
                )
            document = await get_document(session, record.document_id)
            return _render(notice, record, document, avsnitt, offset, ctx.budget)


def _render(
    notice: Notice,
    record: ChecklistRecord,
    document: Document | None,
    part: ChecklistPart,
    offset: int,
    budget: int,
) -> str:
    checklist = Checklist.model_validate(record.payload)
    items = [item for item in _items(checklist) if part == "alla" or item[0] == part]
    source = f"{document.filename} (dokument_id {document.id})" if document else MISSING
    header = [
        f"Publicerad checklista för {notice_label(notice)}, publicerad av inköp "
        f"{format_datetime(record.published_at)}. Sidhänvisningarna gäller {source}. "
        "'kontrollerat' betyder att citatet finns på den angivna sidan."
    ]
    if offset == 0 and part == "alla":
        header.append(f"Sammanfattning: {checklist.summary}")
        if checklist.procedure:
            header.append(f"Förfarande: {checklist.procedure}")
    if not items:
        return "\n".join([*header, "Checklistan har inga punkter i den delen."]) + "\n"
    if offset >= len(items):
        return f"Den delen har bara {count(len(items), 'punkt', 'punkter')}. Anropa igen med offset=0.\n"

    remaining = items[offset:]
    shown = fit_lines([line for _, line in remaining], budget)
    last = offset + shown
    lines = [*header, f"Punkt {offset + 1}–{last} av {len(items)}."]
    current_part = ""
    for item_part, line in remaining[:shown]:
        if item_part != current_part:
            lines += ["", f"## {_PART_TITLES[item_part]}"]
            current_part = item_part
        lines.append(line)
    if last < len(items):
        lines.append(more_hint("offset", last, what="punkter"))
    return "\n".join(lines) + "\n"


def _items(checklist: Checklist) -> list[tuple[str, str]]:
    """Every checklist entry as (part, line), in reading order."""

    items: list[tuple[str, str]] = []
    for key_date in checklist.dates:
        when = format_date(key_date.date)
        items.append(
            (
                "datum",
                f"- {_DATE_KINDS[key_date.kind]}: {when}. {key_date.description} "
                f"Källa: {citation_text(key_date.citation)}",
            )
        )
    for requirement in checklist.requirements:
        evidence = f" Bevis: {requirement.evidence}." if requirement.evidence else ""
        items.append(
            (
                "krav",
                f"- {requirement.id} ({_REQUIREMENT_KINDS[requirement.kind]}) {requirement.title}: "
                f"{requirement.plain_language}{evidence} Källa: {citation_text(requirement.citation)}",
            )
        )
    for attachment in checklist.attachments:
        description = f": {attachment.description}" if attachment.description else ""
        items.append(
            ("bilagor", f"- {attachment.name}{description}. Källa: {citation_text(attachment.citation)}")
        )
    for criterion in checklist.evaluation:
        weight = f" ({criterion.weight_percent:g} %)" if criterion.weight_percent is not None else ""
        items.append(
            (
                "utvardering",
                f"- {criterion.name}{weight}: {criterion.how_assessed} "
                f"Källa: {citation_text(criterion.citation)}",
            )
        )
    for term in checklist.terms:
        source = f" Källa: {citation_text(term.citation)}" if term.citation else ""
        items.append(("begrepp", f"- {term.term}: {term.explanation}{source}"))
    items += [("oklart", f"- {question}") for question in checklist.open_questions]
    return items
