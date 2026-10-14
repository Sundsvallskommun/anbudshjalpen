"""The tools an answer lists: our MCP tools by their registered titles, and the app's own steps."""

from __future__ import annotations

from pydantic import SecretStr

from anbudsklar.ai.engine import EngineRun
from anbudsklar.config import Settings
from anbudsklar.mcp.context import ToolContext
from anbudsklar.mcp.server import _ToolServer
from anbudsklar.mcp.tools import register_tools
from anbudsklar.services.tools import MCP_TOOL_LABELS, STEP_LABELS, engine_tools, tool_use


def test_mcp_tool_labels_are_the_titles_the_server_registers() -> None:
    settings = Settings(_env_file=None, mcp_api_keys=[SecretStr("k")])
    server = _ToolServer(name="anbudsklar")

    async def no_sessions():
        raise AssertionError("listing tools opens no session")

    register_tools(server, ToolContext(settings=settings, sessions=no_sessions))
    registered = {tool.name: tool.title for tool in server._tool_manager.list_tools()}
    assert registered == MCP_TOOL_LABELS
    assert not set(STEP_LABELS) & set(MCP_TOOL_LABELS)


def test_engine_tools_keep_the_order_and_show_unknown_names_as_they_are() -> None:
    run = EngineRun(engine="eneo", tools=["sok_lou", "hamta_paragraf", "nytt_verktyg"])
    assert [(tool.label, tool.detail) for tool in engine_tools(run)] == [
        ("Sök i LOU", None),
        ("Hämta paragraf i LOU", None),
        ("nytt_verktyg", None),
    ]
    assert tool_use("sok_cpv", "3 kandidater").model_dump() == {
        "name": "sok_cpv",
        "label": "Sök CPV-koder",
        "detail": "3 kandidater",
    }
