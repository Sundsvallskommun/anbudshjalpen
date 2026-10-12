"""The questions suppliers asked about a notice in e-Avrop and the answers the buyer published.

Public data (decision 0013): the same rows the web app shows in step 2, and never who
asked. An assistant that reads them before calling a document unclear gives the answer
every supplier already has.
"""

from __future__ import annotations

from collections.abc import Sequence

from mcp.server.fastmcp import FastMCP

from anbudsklar.mcp.context import ToolContext
from anbudsklar.mcp.output import count, fit_lines, format_datetime, more_hint
from anbudsklar.mcp.tools.common import READ_ONLY, Offset, UpphandlingId, notice_label, require_notice
from anbudsklar.models import Notice, PublishedAnswer
from anbudsklar.search.queries import list_published_answers


def register(server: FastMCP, ctx: ToolContext) -> None:
    @server.tool(
        name="hamta_fragor_svar",
        title="Hämta frågor och svar",
        annotations=READ_ONLY,
        structured_output=False,
        description=(
            "Hämta de frågor leverantörer har ställt om en upphandling i e-Avrop och de svar inköp har "
            "publicerat där, äldsta svaret först. Svaren är offentliga och samma för alla leverantörer; vem "
            "som frågade visas aldrig. Använd när användaren undrar om något är förtydligat, ändrat eller "
            "redan besvarat, och innan du säger att underlaget är otydligt: ett publicerat svar hör till "
            "underlaget. Ange upphandlingens titel och svarets datum som källa. Finns inga svar, säg det och "
            "hänvisa till frågefunktionen i e-Avrop."
        ),
    )
    async def hamta_fragor_svar(upphandling_id: UpphandlingId, offset: Offset = 0) -> str:
        async with ctx.session() as session:
            notice = await require_notice(session, upphandling_id)
            answers = await list_published_answers(session, notice.id)
            return _render(notice, answers, offset, ctx.budget)


def _render(notice: Notice, answers: Sequence[PublishedAnswer], offset: int, budget: int) -> str:
    if not answers:
        return (
            f"Inga publicerade frågor och svar för {notice_label(notice)} ännu. Frågor ställs i e-Avrop före "
            "sista dag för frågor, och inköps svar publiceras där för alla leverantörer.\n"
        )
    total = len(answers)
    if offset >= total:
        return f"Det finns bara {count(total, 'svar', 'svar')}. Anropa igen med offset=0.\n"
    entries = [_entry(number, answer) for number, answer in enumerate(answers, start=1)][offset:]
    shown = fit_lines(entries, budget)
    last = offset + shown
    parts = [
        f"Frågor och svar om {notice_label(notice)}, publicerade av inköp i e-Avrop. Svaren hör till "
        "underlaget och är samma för alla leverantörer; vem som frågade visas inte. "
        f"Svar {offset + 1}–{last} av {total}.",
        *entries[:shown],
    ]
    if last < total:
        parts.append(more_hint("offset", last, what="svar"))
    return "\n\n".join(parts) + "\n"


def _entry(number: int, answer: PublishedAnswer) -> str:
    asked = f", ställd {format_datetime(answer.asked_at)}" if answer.asked_at else ""
    return (
        f"## Fråga {number} (besvarad {format_datetime(answer.answered_at)}{asked})\n"
        f"Fråga: {answer.question}\n"
        f"Svar: {answer.answer}"
    )
