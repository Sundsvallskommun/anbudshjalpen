"""The access code that gates the whole service (decision 0010).

With `ACCESS_CODE` set, every /api route except the configuration and the gate itself
answers 401 until the browser has presented the code once. The cookie is an HMAC of the
code under the session secret: stateless, so it survives restarts, and void the moment the
code is changed. /health and /mcp are outside: the MCP server has keys of its own.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import HTTPException, Request, Response, status

from anbudsklar.config import Settings

GATE_COOKIE = "anbudsklar_gate"
GATE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
# Reachable without the code: the app needs them to know that, and to present it.
OPEN_PATHS = frozenset({"/api/config", "/api/gate"})
GATE_MESSAGE = "Ange accesskoden för att använda tjänsten."
WRONG_CODE_MESSAGE = "Fel accesskod. Koden får du av den som bjudit in dig."


def gate_enabled(settings: Settings) -> bool:
    return settings.access_code is not None


def gate_token(settings: Settings) -> str:
    code = settings.access_code
    assert code is not None
    key = settings.session_secret.get_secret_value().encode()
    return hmac.new(key, code.get_secret_value().strip().encode(), hashlib.sha256).hexdigest()


def code_matches(settings: Settings, code: str) -> bool:
    """Compare in constant time, so the response time says nothing about the code."""

    expected = settings.access_code
    if expected is None:
        return False
    return secrets.compare_digest(expected.get_secret_value().strip().encode(), code.strip().encode())


def gate_passed(request: Request, settings: Settings) -> bool:
    if not gate_enabled(settings):
        return True
    presented = request.cookies.get(GATE_COOKIE, "")
    return secrets.compare_digest(presented.encode(), gate_token(settings).encode())


def require_gate(request: Request) -> None:
    """A dependency on every /api route: 401 with the gate's message until the code is in."""

    settings: Settings = request.app.state.settings
    if request.url.path in OPEN_PATHS or gate_passed(request, settings):
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GATE_MESSAGE)


def set_gate_cookie(response: Response, settings: Settings) -> None:
    response.set_cookie(
        GATE_COOKIE,
        gate_token(settings),
        max_age=GATE_MAX_AGE_SECONDS,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
