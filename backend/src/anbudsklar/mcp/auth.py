"""API-key guard for the MCP endpoint.

Pure ASGI on purpose: `BaseHTTPMiddleware` can buffer streamed responses, and the guard
belongs on the MCP routes only, because the rest of the app uses its own session cookie.
"""

from __future__ import annotations

import hmac
import json
from collections.abc import Iterable, Sequence

from starlette.types import ASGIApp, Receive, Scope, Send

API_KEY_HEADER = b"x-api-key"
_BEARER_PREFIX = b"bearer "

_NOT_CONFIGURED = "MCP är inte konfigurerat: ingen API-nyckel är satt (MCP_API_KEYS)."
_UNAUTHORIZED = (
    "Saknad eller ogiltig API-nyckel. Skicka Authorization: Bearer <nyckel> eller X-Api-Key: <nyckel>."
)
_METHOD_NOT_ALLOWED = "Endast POST stöds. Servern är tillståndslös och skickar inga egna händelser."


class ApiKeyGuard:
    """Let a request through only with a configured key.

    Eneo's two auth types are both accepted: `bearer` sends `Authorization: Bearer <key>`
    and `api_key_header` sends `X-Api-Key: <key>`. Several keys can be valid at once so a
    key can be rotated without downtime. With no key configured the endpoint fails closed
    with 503 instead of running open.

    Only POST reaches the MCP handler. In stateless JSON mode a GET would open an idle
    event stream that holds a connection for nothing, and the MCP transport spec allows
    405 for it. Eneo only ever sends POST.
    """

    def __init__(self, app: ASGIApp, keys: Sequence[str]) -> None:
        self._app = app
        self._keys = [key.encode() for key in keys if key]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        if not self._keys:
            await _respond(send, 503, _NOT_CONFIGURED)
        elif not self._authorized(scope["headers"]):
            await _respond(send, 401, _UNAUTHORIZED, (b"www-authenticate", b'Bearer realm="anbudsklar-mcp"'))
        elif scope["method"] != "POST":
            await _respond(send, 405, _METHOD_NOT_ALLOWED, (b"allow", b"POST"))
        else:
            await self._app(scope, receive, send)

    def _authorized(self, headers: Iterable[tuple[bytes, bytes]]) -> bool:
        presented = presented_key(headers)
        # Compare with every key so the timing does not reveal which one matched.
        matches = [hmac.compare_digest(presented, key) for key in self._keys]
        return bool(presented) and any(matches)


def presented_key(headers: Iterable[tuple[bytes, bytes]]) -> bytes:
    """The key from `X-Api-Key`, or else from `Authorization: Bearer`. ASGI lowercases names."""

    api_key = b""
    bearer = b""
    for name, value in headers:
        if name == API_KEY_HEADER:
            api_key = value.strip()
        elif name == b"authorization" and value[: len(_BEARER_PREFIX)].lower() == _BEARER_PREFIX:
            bearer = value[len(_BEARER_PREFIX) :].strip()
    return api_key or bearer


async def _respond(send: Send, status: int, message: str, *extra_headers: tuple[bytes, bytes]) -> None:
    """A JSON-RPC shaped error, so MCP clients can show the message."""

    body = json.dumps(
        {"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": message}}, ensure_ascii=False
    ).encode()
    headers = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(body)).encode()),
        *extra_headers,
    ]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})
