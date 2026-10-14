"""Tools for the rules: LOU, the municipality's steering documents (decision 0022) and the CPV vocabulary.

The law and the steering documents are separate tools rather than one, so that the model
chooses the source by the question and the descriptions can say when each applies. A
steering document binds the municipality's own purchasers, not the supplier, and every
result says so.
"""

from __future__ import annotations

from typing import Annotated

from mcp.server.fastmcp import FastMCP
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.lou_refs import lou_reference, lou_url
from anbudsklar.mcp.context import ToolContext
from anbudsklar.mcp.output import Content, count, fit_blocks, fit_lines, resource_block, text_block
from anbudsklar.mcp.reads import cpv_labels
from anbudsklar.mcp.tools.common import READ_ONLY, clamped, trimmed
from anbudsklar.models import CpvCode, LouSection, PolicySection
from anbudsklar.policy_refs import parse_policy_reference, policy_reference, policy_url
from anbudsklar.search.queries import (
    cpv_with_ancestors,
    get_lou_section,
    get_policy_section,
    list_policy_documents,
    parse_lou_reference,
    search_cpv,
    search_lou,
    search_policy_sections,
)

Referens = Annotated[
    str,
    Field(
        description="Paragrafen, t.ex. '4 kap. 1 §', '20 kap. 1 §' eller '20:1'.",
        min_length=3,
        max_length=40,
    ),
    trimmed(40),  # the reference is found inside a longer text, so a cut one still parses
]
LouFraga = Annotated[
    str,
    Field(
        description="Ämnet på svenska, t.ex. 'avtalsspärr' eller 'uteslutning av leverantör'.",
        min_length=2,
        max_length=200,
    ),
    trimmed(200),
]
LouLimit = Annotated[int, Field(description="Antal paragrafer.", ge=1, le=10), clamped(1, 10)]
AvsnittReferens = Annotated[
    str,
    Field(
        description="Avsnittet, t.ex. 'Inköpsstrategin 5.2' eller bara '5.2'.",
        min_length=1,
        max_length=60,
    ),
    trimmed(60),
]
StyrdokumentFraga = Annotated[
    str,
    Field(
        description="Ämnet på svenska, t.ex. 'kollektivavtal underleverantörer' eller 'småföretag'.",
        min_length=2,
        max_length=200,
    ),
    trimmed(200),
]
StyrdokumentLimit = Annotated[int, Field(description="Antal avsnitt.", ge=1, le=10), clamped(1, 10)]
Beskrivning = Annotated[
    str,
    Field(
        description="Vad företaget gör eller vad som köps, t.ex. 'målning av fasader', eller en CPV-kod.",
        min_length=2,
        max_length=200,
    ),
    trimmed(200),
]
CpvLimit = Annotated[int, Field(description="Antal koder.", ge=1, le=30), clamped(1, 30)]

_LOU = "lagen om offentlig upphandling (LOU, SFS 2016:1145)"
_LOU_TITLE = "lagen (2016:1145) om offentlig upphandling"
_NOT_ADVICE = "Ge allmän information om reglerna, inte juridisk rådgivning i ett enskilt fall."
_POLICY_SCOPE = (
    "Ett styrdokument binder kommunens egna beställare, inte leverantören; vad lagen kräver står i LOU."
)
_POLICY_CITE = "Citera ordagrant och ange dokument och avsnitt, t.ex. 'Inköpsstrategin 5.2'."


def register(server: FastMCP, ctx: ToolContext) -> None:
    @server.tool(
        name="hamta_paragraf",
        title="Hämta paragraf i LOU",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            f"Hämta lagtexten i en paragraf i {_LOU}, t.ex. '4 kap. 1 §', '20 kap. 1 §' eller '20:1'. "
            "Använd när användaren eller underlaget hänvisar till en viss paragraf. Svaret är en egen källa. "
            f"Citera ordagrant och ange kapitel och paragraf, t.ex. 'LOU 4 kap. 1 §'. {_NOT_ADVICE}"
        ),
    )
    async def hamta_paragraf(referens: Referens) -> list[Content]:
        parsed = parse_lou_reference(referens)
        if parsed is None:
            return [
                text_block(
                    f"Kunde inte tolka '{referens}' som en paragraf. Skriv t.ex. '4 kap. 1 §' eller '20:1', "
                    "eller sök med sok_lou."
                )
            ]
        chapter, section = parsed
        async with ctx.session() as session:
            row = await get_lou_section(session, chapter, section)
            if row is None:
                return [
                    text_block(
                        f"{lou_reference(chapter, section)} finns inte i lagtexten. Kontrollera numret eller "
                        "sök med sok_lou."
                    )
                ]
            header = (
                f"{lou_reference(row.chapter, row.section)} i {_LOU}. Citera ordagrant och ange kapitel och "
                f"paragraf. {_NOT_ADVICE}"
            )
            return [text_block(header), _section_resource(row)]

    @server.tool(
        name="sok_lou",
        title="Sök i LOU",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            f"Sök i {_LOU} efter paragrafer om ett ämne, t.ex. 'avtalsspärr', 'uteslutning av leverantör' "
            "eller 'direktupphandling'. Använd för allmänna frågor om upphandlingsregler när du inte vet "
            "vilken paragraf som gäller. Varje paragraf är en egen källa. Citera ordagrant och ange kapitel "
            f"och paragraf, t.ex. 'LOU 20 kap. 1 §'. {_NOT_ADVICE}"
        ),
    )
    async def sok_lou(fraga: LouFraga, limit: LouLimit = 5) -> list[Content]:
        async with ctx.session() as session:
            rows = await search_lou(session, fraga, limit=limit)
            if not rows:
                return [
                    text_block(
                        f"Inga paragrafer i LOU matchar '{fraga}'. Prova andra ord, t.ex. lagens egna termer "
                        "som 'tilldelningsbeslut' eller 'kvalificering'."
                    )
                ]
            resources = [_section_resource(row) for row in rows]
            shown = fit_blocks(resources, ctx.budget)
            header = (
                f"{count(shown, 'paragraf', 'paragrafer')} i LOU om '{fraga}'. Citera ordagrant och ange "
                f"kapitel och paragraf. Hämta en enskild paragraf med hamta_paragraf. {_NOT_ADVICE}"
            )
            return [text_block(header), *resources[:shown]]

    @server.tool(
        name="hamta_avsnitt",
        title="Hämta avsnitt i kommunens styrdokument",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Hämta ett avsnitt i Sundsvalls kommuns styrdokument för inköp, t.ex. 'Inköpsstrategin 5.2' "
            "eller bara '5.2'. Använd när användaren eller ett svar hänvisar till ett visst avsnitt. Svaret "
            f"är en egen källa. {_POLICY_CITE} {_POLICY_SCOPE} {_NOT_ADVICE}"
        ),
    )
    async def hamta_avsnitt(referens: AvsnittReferens) -> list[Content]:
        parsed = parse_policy_reference(referens)
        if parsed is None:
            return [
                text_block(
                    f"Kunde inte tolka '{referens}' som ett avsnitt. Skriv t.ex. 'Inköpsstrategin 5.2' eller "
                    "'5.2', eller sök med sok_styrdokument."
                )
            ]
        name, number = parsed
        async with ctx.session() as session:
            row = await get_policy_section(session, number, name)
            if row is None:
                return [text_block(await _missing_section(session, name, number))]
            header = (
                f"{policy_reference(row.document.short_title, row.number)} i {row.document.title}. "
                f"{_POLICY_CITE} {_POLICY_SCOPE} {_NOT_ADVICE}"
            )
            return [text_block(header), _policy_resource(row)]

    @server.tool(
        name="sok_styrdokument",
        title="Sök i kommunens styrdokument för inköp",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Sök i Sundsvalls kommuns styrdokument för inköp, t.ex. inköpsstrategin som kommunfullmäktige "
            "har fastställt, efter avsnitt om kommunens egen inriktning: hållbarhetskrav, villkor i nivå med "
            "kollektivavtal för underleverantörer, sysselsättningskrav, dialog med marknaden, hur kommunen "
            "ser på småföretag och varför kommunen ställer ett krav. Gäller frågan ett krav, sök också i LOU "
            f"med sok_lou. Varje avsnitt är en egen källa. {_POLICY_CITE} {_POLICY_SCOPE} {_NOT_ADVICE}"
        ),
    )
    async def sok_styrdokument(fraga: StyrdokumentFraga, limit: StyrdokumentLimit = 5) -> list[Content]:
        async with ctx.session() as session:
            rows = await search_policy_sections(session, fraga, limit=limit)
            if not rows:
                return [
                    text_block(
                        f"Inga avsnitt i kommunens styrdokument matchar '{fraga}'. Prova andra ord, t.ex. "
                        "'hållbarhet', 'småföretag' eller 'kollektivavtal'. Vad lagen kräver finns med "
                        "sok_lou."
                    )
                ]
            resources = [_policy_resource(row) for row in rows]
            shown = fit_blocks(resources, ctx.budget)
            header = (
                f"{count(shown, 'avsnitt', 'avsnitt')} i kommunens styrdokument om '{fraga}'. {_POLICY_CITE} "
                f"Hämta ett enskilt avsnitt med hamta_avsnitt. {_POLICY_SCOPE} {_NOT_ADVICE}"
            )
            return [text_block(header), *resources[:shown]]

    @server.tool(
        name="sla_upp_cpv",
        title="Slå upp CPV-koder",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Slå upp CPV-koder (EU:s klassificering av det som köps i offentliga upphandlingar) från en "
            "beskrivning på svenska, t.ex. 'målning av fasader', eller från en kod, t.ex. '45442100'. Använd "
            "för att hitta koder innan du söker med sok_upphandlingar eller kommande_upphandlingar, eller "
            "för att förklara vad en kod betyder. Svarar med kod, svensk benämning och överordnade nivåer. "
            "Ett kortare prefix, t.ex. '4544', fångar fler upphandlingar."
        ),
    )
    async def sla_upp_cpv(beskrivning: Beskrivning, limit: CpvLimit = 15) -> str:
        async with ctx.session() as session:
            codes = await search_cpv(session, beskrivning, limit=limit)
            if not codes:
                return (
                    f"Inga CPV-koder matchar '{beskrivning}'. Prova ett annat eller mer allmänt ord, "
                    "t.ex. 'målning' i stället för 'fasadmålning'.\n"
                )
            ancestors = {code.code: _ancestors(code.code) for code in codes}
            labels = await cpv_labels(session, {c for chain in ancestors.values() for c in chain})
            lines = [_cpv_line(code, ancestors[code.code], labels) for code in codes]
            shown = fit_lines(lines, ctx.budget)
            header = (
                f"CPV-koder för '{beskrivning}' ({shown} st). Använd koden, eller ett kortare prefix för en "
                "bredare sökning, som cpv i sok_upphandlingar eller kommande_upphandlingar."
            )
            return "\n".join([header, *lines[:shown]]) + "\n"


def _section_resource(row: LouSection) -> Content:
    reference = lou_reference(row.chapter, row.section)
    lines = [f"{reference}, {_LOU_TITLE}"]
    if row.chapter_title:
        lines.append(f"Kapitel {row.chapter}: {row.chapter_title}")
    if row.heading:
        lines.append(f"Rubrik: {row.heading}")
    if row.consolidated_through:
        lines.append(f"Lydelse t.o.m. {row.consolidated_through}")
    lines += ["", row.text]
    return resource_block(
        uri=lou_url(row.chapter, row.section),
        title=reference,
        body="\n".join(lines),
        section=row.heading,
    )


def _policy_resource(row: PolicySection) -> Content:
    """A section as a citable source. No `pageRange`: Eneo's reference would then say "sida N"
    instead of the section, and the body names the pages itself."""

    document = row.document
    reference = policy_reference(document.short_title, row.number)
    pages = (
        f"Sidan {row.page_start}"
        if row.page_start == row.page_end
        else f"Sidorna {row.page_start}–{row.page_end}"
    )
    lines = [
        f"{reference}, {document.title}",
        f"Avsnitt {row.number}: {row.heading}",
        f"{pages} i dokumentet",
    ]
    if document.decided_by and document.decided_on:
        lines.append(f"Fastställt av {document.decided_by} {document.decided_on.isoformat()}")
    lines += [f"Kommunens styrdokument. {_POLICY_SCOPE}", "", row.text]
    return resource_block(
        uri=policy_url(document.source_url, row.page_start),
        title=reference,
        body="\n".join(lines),
        section=row.heading,
    )


async def _missing_section(session: AsyncSession, name: str | None, number: str) -> str:
    """Why a section was not found: an unknown document, or a number the document does not have."""

    documents = await list_policy_documents(session)
    known = ", ".join(f"'{document.short_title}'" for document in documents) or "inga styrdokument är inlästa"
    if name is not None and not any(
        document.short_title.casefold() in name.casefold() for document in documents
    ):
        return (
            f"Hittar inget styrdokument som heter '{name}'. Kända dokument: {known}. "
            "Sök med sok_styrdokument."
        )
    return f"Avsnitt {number} finns inte i styrdokumentet. Kontrollera numret eller sök med sok_styrdokument."


def _ancestors(code: str) -> list[str]:
    """Broader codes above `code`, broadest first (the query returns the code itself first)."""

    return list(reversed(cpv_with_ancestors(code)[1:]))


def _cpv_line(code: CpvCode, ancestors: list[str], labels: dict[str, str]) -> str:
    line = f"- {code.code} {code.label_sv}"
    if ancestors:
        path = " › ".join(f"{ancestor} {labels.get(ancestor, '')}".strip() for ancestor in ancestors)
        line += f" (under: {path})"
    return line
