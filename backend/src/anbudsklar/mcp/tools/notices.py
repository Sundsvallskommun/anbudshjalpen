"""Tools for finding procurements: search, details and expected upcoming procurements."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from anbudsklar.api.schemas import UpcomingProcurement
from anbudsklar.contracts import DEADLINE_LABELS, deadline_kind
from anbudsklar.mcp.context import ToolContext
from anbudsklar.mcp.output import (
    MISSING,
    STOCKHOLM,
    count,
    fit_lines,
    format_date,
    format_datetime,
    format_sek,
    more_hint,
    shorten,
)
from anbudsklar.mcp.reads import cpv_labels, has_published_checklist, list_documents
from anbudsklar.mcp.tools.common import (
    FICTITIOUS_NOTICE,
    NOTICE_STATUS_LABELS,
    OPEN_FOR_REQUESTS_LABEL,
    READ_ONLY,
    CpvKoder,
    Offset,
    UpphandlingId,
    clamped,
    cpv_overlaps,
    document_line,
    require_notice,
    trimmed,
)
from anbudsklar.models import Document, Notice
from anbudsklar.search.queries import search_notices
from anbudsklar.services.upcoming import ANNOUNCE_MONTHS_BEFORE_END, list_upcoming

StatusFilter = Literal["oppen", "planerad", "avslutad", "tilldelad", "alla"]
_STATUS_FILTER_TO_DB: dict[str, str | None] = {
    "oppen": "open",
    "planerad": "planned",
    "avslutad": "closed",
    "tilldelad": "awarded",
    "alla": None,
}

Fritext = Annotated[
    Annotated[str, Field(min_length=2, max_length=200)] | None,
    Field(
        description=(
            "Sökord på svenska, t.ex. 'målning förskola' eller 'städning'. Utelämna för att lista alla."
        )
    ),
    trimmed(200, blank_is_none=True),
]
Status = Annotated[
    StatusFilter,
    Field(
        description=(
            "oppen = går att lämna anbud nu (standard), planerad = aviserad men inte annonserad, "
            "avslutad, tilldelad eller alla."
        )
    ),
]
SistaAnbudsdagEfter = Annotated[
    date | None,
    Field(description="Visa bara upphandlingar med sista anbudsdag den dagen eller senare (ÅÅÅÅ-MM-DD)."),
]
Limit = Annotated[int, Field(description="Antal träffar per anrop.", ge=1, le=25), clamped(1, 25)]
Manader = Annotated[
    int,
    Field(description="Hur många månader framåt en ny upphandling ska väntas annonseras.", ge=1, le=36),
    clamped(1, 36),
]

DESCRIPTION_MAX_CHARS = 3_000
PREVIOUS_REQUIREMENTS_MAX_CHARS = 300


def register(server: FastMCP, ctx: ToolContext) -> None:
    organization = ctx.settings.organization_name

    @server.tool(
        name="sok_upphandlingar",
        title="Sök upphandlingar",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            f"Sök bland upphandlingar från {organization} med fritext, CPV-koder, status och sista "
            "anbudsdag. Använd när användaren undrar vilka upphandlingar som finns eller letar efter en viss "
            "upphandling. Svarar med upphandling_id, titel, köpare, status, sista anbudsdag, CPV-koder och "
            "länk till annonsen. Hämta detaljer och dokument med hamta_upphandling. Nämn upphandlingens "
            "titel och annonslänk när du hänvisar till den. Fiktiva demo-upphandlingar är märkta FIKTIV."
        ),
    )
    async def sok_upphandlingar(
        fritext: Fritext = None,
        cpv: CpvKoder = None,
        status: Status = "oppen",
        sista_anbudsdag_efter: SistaAnbudsdagEfter = None,
        limit: Limit = 10,
        offset: Offset = 0,
    ) -> str:
        async with ctx.session() as session:
            notices, total = await search_notices(
                session,
                text=fritext,
                cpv_prefixes=cpv,  # full codes cover their descendants; partial prefixes as typed
                status=_STATUS_FILTER_TO_DB[status],
                deadline_after=_start_of_day(sista_anbudsdag_efter),
                limit=limit,
                offset=offset,
            )
            return _render_notice_list(notices, total, offset, ctx.budget)

    @server.tool(
        name="hamta_upphandling",
        title="Hämta upphandling",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Hämta en upphandling: köpare, status, datum, förfarande, CPV-koder, beskrivning, länk till "
            "annonsen, inlästa dokument (dokument_id, filnamn, antal sidor) och om inköp har publicerat en "
            "checklista. Använd efter sok_upphandlingar och innan du läser i underlaget. Läs dokument med "
            "lasa_sidor, sök i dem med sok_i_underlag och hämta checklistan med hamta_checklista. Ange "
            "annonslänken som källa för datum och beskrivning."
        ),
    )
    async def hamta_upphandling(upphandling_id: UpphandlingId) -> str:
        async with ctx.session() as session:
            notice = await require_notice(session, upphandling_id)
            documents = await list_documents(session, notice.id)
            labels = await cpv_labels(session, notice.cpv_codes)
            published = await has_published_checklist(session, notice.id)
            return _render_notice(notice, documents, labels, published, ctx.budget)

    @server.tool(
        name="kommande_upphandlingar",
        title="Kommande upphandlingar",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            f"Visa upphandlingar som troligen kommer, utifrån avtalskatalogen hos {organization}: avtal vars "
            "nya upphandling väntas annonseras inom angivet antal månader (normalt 6–9 månader före "
            "avtalets slutdatum). Använd när användaren vill förbereda sig för kommande upphandlingar. Det "
            "är en prognos, inte ett beslut: säg det och hänvisa till avtalskatalogen. Filtrera med "
            "CPV-koder från sla_upp_cpv."
        ),
    )
    async def kommande_upphandlingar(manader: Manader = 18, cpv: CpvKoder = None, offset: Offset = 0) -> str:
        today = datetime.now(STOCKHOLM).date()
        async with ctx.session() as session:
            items = await list_upcoming(session, months=manader, today=today, company_codes=None)
            if cpv:
                items = [item for item in items if cpv_overlaps(item.cpv_codes, cpv)]
            return _render_upcoming(items, manader, offset, ctx.budget)


def _start_of_day(day: date | None) -> datetime | None:
    """Deadlines are timestamps; a date filter means from midnight Swedish time."""

    return datetime.combine(day, time.min, tzinfo=STOCKHOLM) if day else None


def _render_notice_list(notices: list[Notice], total: int, offset: int, budget: int) -> str:
    if not notices:
        if total and offset >= total:
            return f"Det finns bara {count(total, 'träff', 'träffar')}. Anropa igen med offset=0.\n"
        return (
            "Inga upphandlingar matchar sökningen. Prova färre eller andra sökord, ett kortare CPV-prefix "
            "eller status=alla.\n"
        )
    lines = [_notice_line(notice) for notice in notices]
    shown = fit_lines(lines, budget)
    last = offset + shown
    parts = [
        f"Träff {offset + 1}–{last} av {total}. Hämta detaljer och dokument med hamta_upphandling.",
        *lines[:shown],
    ]
    if last < total:
        parts.append(more_hint("offset", last))
    return "\n".join(parts) + "\n"


def _deadline_label(notice: Notice) -> str:
    """Sista anbudsdag, or sista dag för anbudsansökan when that is all the notice gives."""

    return DEADLINE_LABELS[deadline_kind(notice.deadline_kind)]


def _status_label(notice: Notice) -> str:
    if notice.status == "open" and deadline_kind(notice.deadline_kind) == "request":
        return OPEN_FOR_REQUESTS_LABEL
    return NOTICE_STATUS_LABELS.get(notice.status, notice.status)


def _notice_line(notice: Notice) -> str:
    fields = [
        f"upphandling_id: {notice.id}",
        notice.title,
        f"köpare: {notice.buyer or MISSING}",
        f"status: {_status_label(notice)}",
        f"{_deadline_label(notice).lower()}: {format_datetime(notice.deadline_at)}",
        f"CPV: {', '.join(notice.cpv_codes) or MISSING}",
    ]
    if notice.url:
        fields.append(notice.url)
    if notice.is_fictitious:
        fields.append("FIKTIV")
    return "- " + " | ".join(fields)


def _render_notice(
    notice: Notice, documents: list[Document], labels: dict[str, str], published: bool, budget: int
) -> str:
    cpv = "; ".join(f"{code} {labels.get(code, '')}".strip() for code in notice.cpv_codes) or MISSING
    lines = [f"# {notice.title}", f"upphandling_id: {notice.id}"]
    if notice.is_fictitious:
        lines.append(FICTITIOUS_NOTICE)
    lines.append(f"Köpare: {notice.buyer or MISSING}")
    if notice.reference_number:
        lines.append(f"Referensnummer: {notice.reference_number}")  # as the buyer and e-Avrop name it
    lines += [
        f"Status: {_status_label(notice)}",
        f"Förfarande: {notice.procedure or MISSING}",
        f"Publicerad: {format_datetime(notice.published_at)}",
        f"{_deadline_label(notice)}: {format_datetime(notice.deadline_at)}",
        f"Plats: {notice.place or MISSING}",
        f"Uppskattat värde: {format_sek(notice.estimated_value_sek)}",
        f"CPV: {cpv}",
        f"Annons: {notice.url or MISSING}",
    ]
    if notice.documents_url:
        lines.append(f"Upphandlingsdokument hos köparen: {notice.documents_url}")
    if notice.description:
        lines += ["", "## Beskrivning", shorten(notice.description, min(DESCRIPTION_MAX_CHARS, budget // 4))]
    lines += ["", "## Dokument i Anbudsklar"]
    if documents:
        lines += [document_line(document) for document in documents]
        lines.append("Läs sidor med lasa_sidor och sök i texten med sok_i_underlag.")
    else:
        lines.append("Inga dokument är inlästa. Hänvisa till annonsen för förfrågningsunderlaget.")
    lines += ["", "## Checklista"]
    lines.append(
        "Inköp har publicerat en checklista: hämta den med hamta_checklista."
        if published
        else "Ingen publicerad checklista ännu. Svara utifrån dokumenten med lasa_sidor och sok_i_underlag."
    )
    return "\n".join(lines) + "\n"


def _render_upcoming(items: list[UpcomingProcurement], months: int, offset: int, budget: int) -> str:
    total = len(items)
    if not items:
        return (
            f"Inga avtal i avtalskatalogen väntas upphandlas på nytt inom {months} månader med de valda "
            "filtren. Prova fler månader eller ett kortare CPV-prefix.\n"
        )
    if offset >= total:
        return f"Det finns bara {total} avtal. Anropa igen med offset=0.\n"
    lines = [_upcoming_line(item) for item in items[offset:]]
    shown = fit_lines(lines, budget)
    last = offset + shown
    earliest, latest = ANNOUNCE_MONTHS_BEFORE_END
    parts = [
        f"Prognos från avtalskatalogen, inte beslut: {total} avtal väntas upphandlas på nytt inom {months} "
        f"månader (visar {offset + 1}–{last}). En ny upphandling annonseras normalt {latest}–{earliest} "
        "månader före avtalets slutdatum; förlängs avtalet flyttas den. Säg att det är en prognos och "
        "hänvisa till avtalskatalogen.",
        *lines[:shown],
    ]
    if last < total:
        parts.append(more_hint("offset", last))
    return "\n".join(parts) + "\n"


def _upcoming_line(item: UpcomingProcurement) -> str:
    ends = f"avtalet löper ut {format_date(item.end_date)}"
    window = f"{format_date(item.expected_from)} – {format_date(item.expected_to)}"
    if item.max_end_date and item.max_end_date > item.end_date:
        ends += f", kan förlängas till senast {format_date(item.max_end_date)}"
    announcement = f"ny upphandling väntas annonseras {window}"
    if item.announcement_overdue:
        # The window has passed without a successor notice: point to the notices, not the future.
        announcement = (
            f"borde redan ha annonserats (väntades {window}); sök bland annonserna med sok_upphandlingar"
        )
    fields = [
        item.title,
        f"kategori: {item.category or MISSING}",
        f"CPV: {', '.join(item.cpv_codes) or MISSING}",
        ends,
        announcement,
    ]
    if item.previous_requirements:
        requirements = shorten(item.previous_requirements, PREVIOUS_REQUIREMENTS_MAX_CHARS)
        fields.append(f"krav förra gången: {requirements}")
    if item.is_fictitious:
        fields.append("FIKTIVT AVTAL")
    return "- " + " | ".join(fields)
