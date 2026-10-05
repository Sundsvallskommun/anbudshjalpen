"""Read-only MCP server that lets Eneo assistants look up public procurement data."""

from anbudsklar.mcp.server import McpMount, build_mcp

__all__ = ["McpMount", "build_mcp"]
