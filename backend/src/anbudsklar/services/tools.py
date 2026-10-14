"""The tools an answer rested on, as the views list them (`ToolUse`).

Two kinds share one list, so the panel can show one row of chips per answer: our MCP
tools, which Eneo's assistants call and which the Eneo engine reports by name
(`EngineRun.tools`), and the app's own steps around a call, such as searching the
documents or saving the profile. The labels are the tools' titles, in the same form as
the MCP server registers them, and a test keeps the two in step.
"""

from __future__ import annotations

from anbudsklar.ai.engine import EngineRun
from anbudsklar.api.schemas import ToolUse

__all__ = ["MCP_TOOL_LABELS", "STEP_LABELS", "TOOL_LABELS", "ToolUse", "engine_tools", "tool_use"]

MCP_TOOL_LABELS: dict[str, str] = {
    "sok_upphandlingar": "Sök upphandlingar",
    "hamta_upphandling": "Hämta upphandling",
    "kommande_upphandlingar": "Kommande upphandlingar",
    "hamta_checklista": "Hämta checklista",
    "sok_i_underlag": "Sök i underlaget",
    "lasa_sidor": "Läs sidor i underlaget",
    "kontrollera_citat": "Kontrollera citat",
    "hamta_fragor_svar": "Hämta frågor och svar",
    "hamta_paragraf": "Hämta paragraf i LOU",
    "sok_lou": "Sök i LOU",
    "hamta_avsnitt": "Hämta avsnitt i kommunens styrdokument",
    "sok_styrdokument": "Sök i kommunens styrdokument för inköp",
    "sla_upp_cpv": "Slå upp CPV-koder",
}
STEP_LABELS: dict[str, str] = {
    "valj_amne": "Välj ämne",
    "hamta_profil": "Hämta profilen",
    "sok_cpv": "Sök CPV-koder",
    "tolka_meddelande": "Tolka meddelandet",
    "spara_profil": "Spara profilen",
    "bedom_matchning": "Bedöm upphandlingarna på nytt",
    "sok_underlag": "Sök i underlaget",
    "las_underlag": "Läs underlaget",
    "hamta_svar": "Hämta inköps publicerade svar",
    "sok_regeltexter": "Sök i LOU och styrdokumenten",
}
TOOL_LABELS: dict[str, str] = {**MCP_TOOL_LABELS, **STEP_LABELS}


def tool_use(name: str, detail: str | None = None) -> ToolUse:
    """One tool or step by name; an unknown name (a tool Eneo added later) is shown as it is."""

    return ToolUse(name=name, label=TOOL_LABELS.get(name, name), detail=detail)


def engine_tools(run: EngineRun) -> list[ToolUse]:
    """The MCP tools the engine's assistant called, in the order it first used them."""

    return [tool_use(name) for name in run.tools]
