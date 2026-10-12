"""Browser sessions, Regelhjälpen conversation owners and the same-origin check.

PoC only: a session starts when someone picks a demo persona (see
`anbudsklar.services.personas`). The cookie holds an opaque random id; the session
itself lives in this process, which is why the app runs with one worker. Logging out
deletes it server-side. Production replaces the persona picker with the
municipality's e-ID (decision 0007) and keeps the cookie rules.

Regelhjälpen conversations are tied to the browser that started them in the same way,
with a cookie of their own because anonymous visitors use Regelhjälpen too.
"""

from __future__ import annotations

import re
import secrets
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, Response, status

from anbudsklar.config import Settings

SESSION_COOKIE = "anbudsklar_session"
RULES_COOKIE = "anbudsklar_regelhjalpen"
RULES_COOKIE_PATH = "/api/rules"
SESSION_MAX_AGE_SECONDS = 8 * 60 * 60
# Far above any demo; beyond it the oldest sessions are signed out instead of memory growing.
MAX_SESSIONS = 10_000
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
_DEFAULT_PORTS = {"http": 80, "https": 443}
_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")  # secrets.token_urlsafe(32)


@dataclass(frozen=True)
class _Entry[V]:
    value: V
    expires_at: float


class ExpiringStore[V]:
    """In-process values under string keys, each kept for the same fixed time.

    Every entry lives equally long, so insertion order is expiry order: expired entries
    are dropped from the front, and above `max_entries` the oldest go first. Putting a
    key again moves it to the back with a fresh expiry.
    """

    def __init__(self, max_age_seconds: int, max_entries: int) -> None:
        self._max_age = max_age_seconds
        self._max_entries = max_entries
        self._entries: OrderedDict[str, _Entry[V]] = OrderedDict()

    def __len__(self) -> int:
        return len(self._entries)

    def put(self, key: str, value: V) -> None:
        self._entries.pop(key, None)
        self._drop_expired()
        while len(self._entries) >= self._max_entries:
            self._entries.popitem(last=False)
        self._entries[key] = _Entry(value=value, expires_at=time.monotonic() + self._max_age)

    def get(self, key: str) -> V | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            del self._entries[key]
            return None
        return entry.value

    def delete(self, key: str) -> None:
        self._entries.pop(key, None)

    def _drop_expired(self) -> None:
        now = time.monotonic()
        while self._entries:
            key, entry = next(iter(self._entries.items()))
            if entry.expires_at > now:
                break
            del self._entries[key]


class SessionStore(ExpiringStore[uuid.UUID]):
    """Signed-in browsers: an unguessable token (the cookie) to the user id."""

    def __init__(
        self, max_age_seconds: int = SESSION_MAX_AGE_SECONDS, max_sessions: int = MAX_SESSIONS
    ) -> None:
        super().__init__(max_age_seconds, max_sessions)

    def create(self, user_id: uuid.UUID) -> str:
        token = secrets.token_urlsafe(32)
        self.put(token, user_id)
        return token

    def user_id(self, token: str) -> uuid.UUID | None:
        return self.get(token)


class ConversationStore(ExpiringStore[str]):
    """Which browser started each Regelhjälpen conversation in Eneo.

    Regelhjälpen is open to anonymous visitors, so the owner is a random token in its own
    cookie (`RULES_COOKIE`), not the login session. A conversation id is continued only
    for the browser it was handed to; any other id starts a new conversation. Eneo's
    session ids are random UUIDs, so this is defence in depth: one visitor cannot steer
    the space's admin key into another visitor's conversation even with its id.
    """

    def __init__(
        self, max_age_seconds: int = SESSION_MAX_AGE_SECONDS, max_conversations: int = MAX_SESSIONS
    ) -> None:
        super().__init__(max_age_seconds, max_conversations)

    def bind(self, conversation_id: str, owner: str) -> None:
        self.put(conversation_id, owner)

    def belongs_to(self, conversation_id: str, owner: str) -> bool:
        stored = self.get(conversation_id)
        return stored is not None and secrets.compare_digest(stored, owner)


def conversation_owner(presented: str | None) -> str:
    """The browser's Regelhjälpen token, or a new one when it has none (or an odd one)."""

    if presented is not None and _TOKEN.fullmatch(presented):
        return presented
    return secrets.token_urlsafe(32)


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE_SECONDS,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def set_rules_cookie(response: Response, owner: str, settings: Settings) -> None:
    """Regelhjälpen's owner token; only sent to /api/rules, renewed on every question."""

    response.set_cookie(
        RULES_COOKIE,
        owner,
        max_age=SESSION_MAX_AGE_SECONDS,
        path=RULES_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax"
    )


def origin_of(url: str) -> str | None:
    """Normalised scheme://host[:port], without the default port; None for anything else."""

    parts = urlsplit(url.strip())
    if parts.scheme not in _DEFAULT_PORTS or not parts.hostname:
        return None
    try:
        port = parts.port
    except ValueError:
        return None
    host = parts.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    suffix = f":{port}" if port and port != _DEFAULT_PORTS[parts.scheme] else ""
    return f"{parts.scheme}://{host}{suffix}"


def require_same_origin(request: Request) -> None:
    """CSRF protection without tokens: a write must come from a page on our own origin.

    Browsers send `Origin` on every cross-site and same-site POST/PUT/DELETE; `Referer`
    covers the rare client that omits it. The expected origin is PUBLIC_URL, the address
    the browser uses (the Vite dev server in development).
    """

    if request.method in SAFE_METHODS:
        return
    expected: str = request.app.state.public_origin
    presented = request.headers.get("origin") or request.headers.get("referer")
    if presented is None or origin_of(presented) != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Begäran kom inte från Anbudshjälpen."
        )
