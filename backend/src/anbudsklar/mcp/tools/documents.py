"""Tools that read procurement documents page by page, so every answer can cite a page."""

from __future__ import annotations

from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.contracts import EMPTY_PAGE_TEXT
from anbudsklar.mcp.context import ToolContext, parse_id
from anbudsklar.mcp.guidance import ToolGuidance
from anbudsklar.mcp.output import Content, count, fit_blocks, more_hint, resource_block, text_block
from anbudsklar.mcp.reads import list_documents
from anbudsklar.mcp.tools.common import (
    READ_ONLY,
    UpphandlingId,
    clamped,
    document_line,
    notice_label,
    require_notice,
    trimmed,
)
from anbudsklar.models import Document, Notice
from anbudsklar.search.queries import find_quote, read_pages, search_document
from anbudsklar.search.types import PageHit, PageText, QuoteCheck

MAX_PAGES_PER_CALL = 5
SEARCH_HITS = 8

DocumentSection = Literal[
    "administrativa",
    "kvalificering",
    "kravspecifikation",
    "utvardering",
    "avtalsvillkor",
    "bilagor",
    "prisbilaga",
]

Fraga = Annotated[
    str,
    Field(
        description=(
            "Vad du letar efter, med underlagets ord, t.ex. 'ansvarsförsäkring' eller 'viktning pris'."
        ),
        min_length=2,
        max_length=300,
    ),
    trimmed(300),
]
Avsnitt = Annotated[
    DocumentSection | None,
    Field(description="Sök bara i en del av underlaget, t.ex. kvalificering eller utvardering."),
]
FranSida = Annotated[int, Field(description="Första sidan, 1-baserad.", ge=1), clamped(1)]
TillSida = Annotated[
    int | None,
    Field(description="Sista sidan, högst fran_sida + 4. Utelämna för att läsa en sida.", ge=1),
    clamped(1),
]
FranSidaFilter = Annotated[
    int | None, Field(description="Sök bara från och med den här sidan.", ge=1), clamped(1)
]
TillSidaFilter = Annotated[
    int | None, Field(description="Sök bara till och med den här sidan.", ge=1), clamped(1)
]
DokumentId = Annotated[
    str | None,
    Field(description="dokument_id från hamta_upphandling. Krävs bara när upphandlingen har flera dokument."),
]
Citat = Annotated[
    str, Field(description="Citatet ordagrant, som du tänker återge det.", min_length=5, max_length=500)
]
Sida = Annotated[int | None, Field(description="Sidan du tror att citatet står på.", ge=1), clamped(1)]

_CITE_RULE = "Citera ordagrant och ange dokument och sidnummer, t.ex. '(s. 4)'."
_EMPTY_PAGE = EMPTY_PAGE_TEXT


def register(server: FastMCP, ctx: ToolContext) -> None:
    @server.tool(
        name="sok_i_underlag",
        title="Sök i underlaget",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Sök i förfrågningsunderlaget till en upphandling efter ord eller en fråga, t.ex. "
            "'ansvarsförsäkring' eller 'hur viktas priset'. Använd när användaren frågar vad underlaget "
            "säger om något. Varje träff är ett utdrag ur en sida, med dokument och sidnummer, och är en "
            "egen källa. Läs hela sidan med lasa_sidor innan du svarar. " + _CITE_RULE + " Säg tydligt om "
            "underlaget inte tar upp frågan."
        ),
    )
    async def sok_i_underlag(
        upphandling_id: UpphandlingId,
        fraga: Fraga,
        avsnitt: Avsnitt = None,
        fran_sida: FranSidaFilter = None,
        till_sida: TillSidaFilter = None,
    ) -> list[Content]:
        if fran_sida and till_sida and till_sida < fran_sida:
            fran_sida, till_sida = till_sida, fran_sida  # a reversed range means the same pages
        async with ctx.session() as session:
            notice = await require_notice(session, upphandling_id)
            hits = await search_document(
                session,
                notice.id,
                fraga,
                sections=[avsnitt] if avsnitt else None,
                first_page=fran_sida,
                last_page=till_sida,
                limit=SEARCH_HITS,
            )
            return _render_hits(ctx, notice, fraga, hits)

    @server.tool(
        name="lasa_sidor",
        title="Läs sidor i underlaget",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Läs ordagrann text från sidor i förfrågningsunderlaget, högst 5 sidor per anrop. Använd för att "
            "läsa innehållsförteckningen (sida 1–2), sidor som sok_i_underlag hittat eller sidor som "
            "checklistan hänvisar till. Varje sida är en egen källa. " + _CITE_RULE + " Har upphandlingen "
            "flera dokument, ange dokument_id från hamta_upphandling."
        ),
    )
    async def lasa_sidor(
        upphandling_id: UpphandlingId,
        fran_sida: FranSida,
        till_sida: TillSida = None,
        dokument_id: DokumentId = None,
    ) -> list[Content]:
        first, requested_last = sorted((fran_sida, till_sida or fran_sida))  # reversed: same pages
        async with ctx.session() as session:
            notice = await require_notice(session, upphandling_id)
            document = await _choose_document(session, notice, dokument_id)
            if first > document.page_count:
                return [
                    text_block(
                        f"{document.filename} (dokument_id {document.id}) har {document.page_count} sidor, "
                        f"så sida {first} finns inte. Välj fran_sida mellan 1 och {document.page_count}."
                    )
                ]
            last = min(requested_last, first + MAX_PAGES_PER_CALL - 1, document.page_count)
            pages = await read_pages(session, notice.id, first, last, document_id=document.id)
            return _render_pages(ctx, notice, document, pages, requested_last=requested_last)

    @server.tool(
        name="kontrollera_citat",
        title="Kontrollera citat",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Kontrollera att ett citat står ordagrant i förfrågningsunderlaget och på vilken sida. Använd "
            "innan du citerar något som du inte just har läst med lasa_sidor, eller när användaren undrar om "
            "en formulering finns i underlaget. Svarar att citatet finns på angiven sida, finns på en annan "
            "sida (ange då den sidan) eller inte hittades (använd det då inte)."
        ),
    )
    async def kontrollera_citat(
        upphandling_id: UpphandlingId, citat: Citat, sida: Sida = None
    ) -> list[Content]:
        async with ctx.session() as session:
            notice = await require_notice(session, upphandling_id)
            result = await find_quote(session, notice.id, citat, page=sida)
            if result.check == "unverified" or result.found_page is None or result.document_id is None:
                return [
                    text_block(
                        f"Citatet hittades inte i underlaget till {notice_label(notice)}. Använd det inte "
                        "som citat. Sök med sok_i_underlag eller läs sidan med lasa_sidor och citera "
                        "ordagrant."
                    )
                ]
            page = result.found_page
            pages = await read_pages(session, notice.id, page, page, document_id=result.document_id)
            return [text_block(_quote_verdict(result, page)), *[_page_resource(ctx, text) for text in pages]]


async def _choose_document(session: AsyncSession, notice: Notice, dokument_id: str | None) -> Document:
    """The document to read, or guidance on choosing one when the call does not say which."""

    documents = await list_documents(session, notice.id)
    if not documents:
        raise ToolGuidance(
            f"{notice_label(notice)} har inga inlästa dokument. "
            f"Hänvisa till annonsen: {notice.url or 'saknas'}."
        )
    listing = "\n".join(document_line(document) for document in documents)
    if dokument_id is None:
        if len(documents) == 1:
            return documents[0]
        raise ToolGuidance(f"Upphandlingen har flera dokument. Ange dokument_id för ett av dem:\n{listing}")
    wanted = parse_id(dokument_id, field="dokument_id", where="hamta_upphandling")
    for document in documents:
        if document.id == wanted:
            return document
    raise ToolGuidance(
        f"dokument_id {dokument_id} hör inte till upphandlingen. Välj ett av dessa:\n{listing}"
    )


def _quote_verdict(result: QuoteCheck, page: int) -> str:
    """Say where the quote stands, and never call a fuzzy match verbatim."""

    location = f"sida {page} i {result.filename or 'underlaget'}"
    if result.check == "moved":
        verdict = (
            f"Citatet står inte på sida {result.requested_page} utan på {location}. "
            f"Ange sida {page} när du citerar."
        )
        if not result.exact:
            verdict += " Texten stämmer nästan men inte ordagrant: citera den exakt som den står på sidan."
    elif result.exact:
        verdict = f"Citatet står ordagrant på {location}."
    else:
        verdict = (
            f"Citatet står nästan ordagrant på {location}. Citera texten exakt som den står på sidan, "
            "inte din egen formulering."
        )
    if result.excerpt:
        verdict += f"\nUtdrag: {result.excerpt}"
    return verdict


def _render_hits(ctx: ToolContext, notice: Notice, query: str, hits: list[PageHit]) -> list[Content]:
    if not hits:
        return [
            text_block(
                f"Inga träffar för '{query}' i underlaget till {notice_label(notice)}. Prova andra ord eller "
                "synonymer, ta bort avsnitt eller sidfilter, eller läs innehållsförteckningen med lasa_sidor "
                "fran_sida=1. Hittar du inget: säg att underlaget inte tar upp frågan och föreslå en formell "
                "fråga till köparen i e-Avrop före frågestoppet."
            )
        ]
    resources = [_hit_resource(ctx, hit) for hit in hits]
    shown = fit_blocks(resources, ctx.budget)
    header = (
        f"{count(len(hits), 'träff', 'träffar')} för '{query}' i underlaget till {notice_label(notice)}. "
        f"Varje träff är ett utdrag; läs hela sidan med lasa_sidor innan du svarar. {_CITE_RULE}"
    )
    if shown < len(hits):
        header += f" Visar de {shown} bästa; snäva in med avsnitt, fran_sida eller till_sida för att se fler."
    return [text_block(header), *resources[:shown]]


def _hit_resource(ctx: ToolContext, hit: PageHit) -> Content:
    lines = [f"Dokument: {hit.filename}", f"dokument_id: {hit.document_id}", f"Sida: {hit.page_no}"]
    if hit.section:
        lines.append(f"Avsnitt: {hit.section}")
    lines += ["", f"Utdrag: {hit.snippet}"]
    return resource_block(
        uri=ctx.document_page_url(hit.document_id, hit.page_no),
        title=hit.filename,
        body="\n".join(lines),
        page_range=str(hit.page_no),
        section=hit.section,
    )


def _render_pages(
    ctx: ToolContext, notice: Notice, document: Document, pages: list[PageText], *, requested_last: int
) -> list[Content]:
    if not pages:
        return [
            text_block(
                f"Texten i {document.filename} är inte inläst ännu. Hänvisa till annonsen eller försök "
                "senare."
            )
        ]
    resources = [_page_resource(ctx, page) for page in pages]
    shown = fit_blocks(resources, ctx.budget)
    shown_last = pages[shown - 1].page_no
    header = (
        f"{document.filename} (dokument_id {document.id}) i {notice_label(notice)}: "
        f"sida {pages[0].page_no}–{shown_last} av {document.page_count}. Varje sida är en egen källa. "
        f"{_CITE_RULE}"
    )
    if shown_last < min(requested_last, document.page_count):
        header += " " + more_hint("fran_sida", shown_last + 1, "sidor")
    return [text_block(header), *resources[:shown]]


def _page_resource(ctx: ToolContext, page: PageText) -> Content:
    lines = [
        f"Dokument: {page.filename}",
        f"dokument_id: {page.document_id}",
        f"Sida: {page.page_no} av {page.page_count}",
    ]
    if page.section:
        lines.append(f"Avsnitt: {page.section}")
    lines += ["", page.text.strip() or _EMPTY_PAGE]
    return resource_block(
        uri=ctx.document_page_url(page.document_id, page.page_no),
        title=page.filename,
        body="\n".join(lines),
        page_range=str(page.page_no),
        section=page.section,
    )
