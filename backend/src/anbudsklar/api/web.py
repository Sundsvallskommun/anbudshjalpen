"""Security headers and serving the built single-page app (eneo-module-kit's web.py).

The CSP is strict: a Vite production build only emits same-origin script and style
files, so no `unsafe-inline` is needed. Vite's dev server serves its own HTML in
development and never gets these headers.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ]
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
}
# Paths that belong to the API or MCP: an unknown one is a JSON 404, never the app's HTML.
_NON_PAGE_PREFIXES = ("api/", "mcp/")
_NON_PAGE_PATHS = frozenset({"api", "mcp"})


class SecurityHeadersMiddleware:
    """Pure ASGI, so streaming and background tasks are untouched.

    A header the route already set wins, which lets a single response relax a rule.
    """

    def __init__(self, app: ASGIApp, headers: dict[str, str] | None = None) -> None:
        self.app = app
        self.headers = headers or SECURITY_HEADERS

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.headers.items():
                    if name not in headers:
                        headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)


def serve_web(app: FastAPI, static_dir: Path) -> None:
    """The built UI: its assets, and its one HTML file for every page of the app.

    Registered last. A path under /api or /mcp, and a path that names a file that is not
    there, is a 404, never HTML.
    """

    root = static_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"FRONTEND_DIST has no index.html: {root}")
    assets = root / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def page(path: str) -> Response:
        if path in _NON_PAGE_PATHS or path.startswith(_NON_PAGE_PREFIXES):
            raise HTTPException(status_code=404)
        if "." in path.rsplit("/", 1)[-1]:
            candidate = (root / path).resolve()
            if candidate.is_file() and root in candidate.parents:
                return FileResponse(candidate)
            raise HTTPException(status_code=404)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
