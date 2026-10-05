"""Anbudsklar's read-only MCP server for Eneo assistants (mcp>=1.30,<2, FastMCP).

Shaped by how Eneo's MCP client behaves:
- Stateless streamable HTTP with JSON responses. Eneo opens a fresh connection per chat
  turn and never relies on a session id, so any worker can answer any request.
- Exact routes for `/mcp` and `/mcp/`. Eneo's client cannot follow redirects, and a
  Starlette `Mount` redirects one form to the other, which would break registration.
- Public procurement data only. Company profiles, questions, matches and drafts are not
  reachable from here, and checklists are shown only once inköp has published them.
- Errors only for real failures. Eneo's circuit breaker counts results marked `isError`,
  so mistakes the model can fix come back as ordinary results with guidance (`guidance`).

The web app adds `McpMount.routes` before its SPA fallback and enters
`McpMount.lifespan()` in its own lifespan, because mounted sub-app lifespans never run.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator, Callable, Iterable, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.fastmcp.server import StreamableHTTPASGIApp
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ContentBlock
from starlette.routing import Route

from anbudsklar.config import Settings
from anbudsklar.db import session_scope
from anbudsklar.mcp.auth import ApiKeyGuard
from anbudsklar.mcp.context import SessionFactory, ToolContext
from anbudsklar.mcp.guidance import recoverable_message
from anbudsklar.mcp.output import text_block
from anbudsklar.mcp.tools import register_tools

MCP_PATH = "/mcp"
SERVER_NAME = "anbudsklar"

# Host headers other than PUBLIC_URL's: local runs, the compose service and Eneo on the
# Docker host. FastMCP answers any other Host with 421 (DNS-rebinding protection), and a
# "host:*" pattern does not match a Host header without a port.
_EXTRA_HOSTS = ("localhost:*", "127.0.0.1:*", "[::1]:*", "app:*", "anbudsklar:*", "host.docker.internal:*")
# "name:3001" or "[::1]:3001": an operator's entry that already names one port.
_EXPLICIT_PORT = re.compile(r"^(?:[^:\[\]]+|\[[^\]]+\]):\d+$")

_INSTRUCTIONS = (
    "Offentliga upphandlingar, förfrågningsunderlag sida för sida, publicerade checklistor, LOU och CPV. "
    "Endast läsning. Hänvisa alltid till källan: dokument och sida, eller LOU kapitel och paragraf."
)


@asynccontextmanager
async def _nothing_to_run() -> AsyncIterator[None]:
    yield


class _ToolServer(FastMCP):
    """FastMCP that answers recoverable tool mistakes as ordinary results.

    FastMCP turns whatever a tool raises into a result marked `isError`, which Eneo 2.2
    counts toward its server-wide circuit breaker. Guidance from the tools and argument
    validation errors are answered as text instead; every other error stays an error.
    """

    async def call_tool(
        self, name: str, arguments: dict[str, Any]
    ) -> Sequence[ContentBlock] | dict[str, Any]:
        try:
            return await super().call_tool(name, arguments)
        except ToolError as error:
            message = recoverable_message(self._tool_manager.get_tool(name), error)
            if message is None:
                raise
            return [text_block(message)]


@dataclass(frozen=True)
class McpMount:
    """What the web app needs to serve MCP: routes to add and a lifespan to enter once."""

    routes: list[Route] = field(default_factory=list)
    lifespan: Callable[[], AbstractAsyncContextManager[None]] = _nothing_to_run


def build_mcp(settings: Settings, *, sessions: SessionFactory = session_scope) -> McpMount:
    """Build a fresh MCP server for one app instance.

    A new FastMCP is needed per app because its session manager can run only once.
    `sessions` opens database sessions for the tools; tests pass one bound to their
    transaction. With `MCP_ENABLED=false` nothing is served.
    """

    if not settings.mcp_enabled:
        return McpMount()
    server = _ToolServer(
        name=SERVER_NAME,
        instructions=_INSTRUCTIONS,
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=allowed_hosts(settings.public_url, settings.mcp_allowed_hosts),
            allowed_origins=[],  # server-to-server only: any request with an Origin header gets 403
        ),
    )
    register_tools(server, ToolContext(settings=settings, sessions=sessions))
    server.streamable_http_app()  # creates server.session_manager
    keys = [key.get_secret_value() for key in settings.mcp_api_keys]
    endpoint = ApiKeyGuard(StreamableHTTPASGIApp(server.session_manager), keys)
    return McpMount(
        routes=[Route(MCP_PATH, endpoint=endpoint), Route(f"{MCP_PATH}/", endpoint=endpoint)],
        lifespan=server.session_manager.run,
    )


def allowed_hosts(public_url: str, extra: Iterable[str] = ()) -> list[str]:
    """Host header patterns to accept: PUBLIC_URL's host, the fixed extras and MCP_ALLOWED_HOSTS.

    `extra` lets an operator add a name Eneo uses on an internal network, such as the
    Dokploy service name `anbudsklar-app`.
    """

    host = urlsplit(public_url).hostname
    own: list[str] = []
    if host:
        own = _host_patterns(f"[{host}]" if ":" in host else host)
    configured = [pattern for entry in extra for pattern in _host_patterns(entry)]
    return list(dict.fromkeys([*own, *_EXTRA_HOSTS, *configured]))


def _host_patterns(entry: str) -> list[str]:
    """Patterns for one host entry: with and without a port, unless it names one port.

    FastMCP's "host:*" does not match a Host header without a port, so "anbudsklar-app"
    and "anbudsklar-app:*" both become the pair, and "anbudsklar-app:3001" stays exact.
    """

    entry = entry.strip()
    if not entry or _EXPLICIT_PORT.match(entry):
        return [entry] if entry else []
    host = entry.removesuffix(":*")
    return [host, f"{host}:*"]
