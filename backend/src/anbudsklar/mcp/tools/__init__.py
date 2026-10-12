"""The read-only MCP tools, registered on a FastMCP server."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from anbudsklar.mcp.context import ToolContext
from anbudsklar.mcp.tools import answers, checklists, documents, notices, rules


def register_tools(server: FastMCP, ctx: ToolContext) -> None:
    notices.register(server, ctx)
    checklists.register(server, ctx)
    documents.register(server, ctx)
    answers.register(server, ctx)
    rules.register(server, ctx)
