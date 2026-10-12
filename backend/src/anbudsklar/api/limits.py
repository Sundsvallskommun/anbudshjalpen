"""Abuse controls for a public PoC: rate limits per client, a cap on concurrent AI calls
and a cap on request bodies.

Several endpoints that call the AI engine need no sign-in, and with `AI_ENGINE=eneo` every
call spends the shared quota of the service key. Everything here lives in the app
process, which runs as one process anyway (sessions live in its memory, decision 0007).
The client is the address uvicorn reports; behind Dokploy's Traefik that is the
visitor's address from `X-Forwarded-For` (`anbudsklar serve` trusts the proxy header).
The limits are listed in docs/operations.md.
"""

from __future__ import annotations

import asyncio
import math
import re
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from starlette.types import ASGIApp, Message, Receive, Scope, Send

RATE_LIMITED_MESSAGE = "Du har gjort många förfrågningar på kort tid. Vänta en stund och försök igen."
BUSY_MESSAGE = "Många använder AI-stödet just nu. Försök igen om en stund."
TOO_LARGE_MESSAGE = "Begäran är för stor."


@dataclass(frozen=True)
class Limit:
    """A token bucket: `capacity` requests at once, refilled evenly over `per_seconds`."""

    capacity: int
    per_seconds: float

    @property
    def refill_per_second(self) -> float:
        return self.capacity / self.per_seconds


TEN_MINUTES = 600.0
# Generous enough for a workshop where everyone shares one public address. Logging in is
# cheap and the session store is bounded; the accessibility gate logs in about 70 times.
DEFAULT_LIMITS: Mapping[str, Limit] = {
    "login": Limit(300, TEN_MINUTES),
    "gate": Limit(20, TEN_MINUTES),  # guesses at the access code, per address
    "lab": Limit(20, TEN_MINUTES),  # lab companies created, per address
    "questions": Limit(60, TEN_MINUTES),
    "rules": Limit(60, TEN_MINUTES),
    "review": Limit(20, TEN_MINUTES),
    "cpv_suggestions": Limit(30, TEN_MINUTES),
    "interpret": Limit(30, TEN_MINUTES),  # buyer uploads and new interpretations
}
MAX_TRACKED_CLIENTS = 20_000
MAX_CONCURRENT_AI_CALLS = 4
AI_SLOT_WAIT_SECONDS = 30.0
MAX_BODY_BYTES = 1024 * 1024
# Uploads cap their own size while they stream in (`api.uploads.read_upload`).
UPLOAD_PATHS = (
    re.compile(r"^/api/admin/notices/[^/]+/documents$"),
    re.compile(r"^/api/notices/[^/]+/review$"),
)


@dataclass
class _Bucket:
    tokens: float
    updated: float


class RateLimiter:
    """Token buckets per (scope, client), the least recently used dropped beyond `max_clients`.

    Dropping a bucket only gives that client a full bucket again, so the memory bound
    never blocks anyone.
    """

    def __init__(
        self,
        limits: Mapping[str, Limit] = DEFAULT_LIMITS,
        *,
        max_clients: int = MAX_TRACKED_CLIENTS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limits = dict(limits)
        self._max_clients = max_clients
        self._clock = clock
        self._buckets: OrderedDict[tuple[str, str], _Bucket] = OrderedDict()

    def hit(self, scope: str, client: str) -> float | None:
        """Spend one token. None when allowed, otherwise the seconds until a token is back."""

        limit = self._limits[scope]
        now = self._clock()
        key = (scope, client)
        bucket = self._buckets.pop(key, None) or _Bucket(tokens=float(limit.capacity), updated=now)
        bucket.tokens = min(limit.capacity, bucket.tokens + (now - bucket.updated) * limit.refill_per_second)
        bucket.updated = now
        self._buckets[key] = bucket
        while len(self._buckets) > self._max_clients:
            self._buckets.popitem(last=False)
        if bucket.tokens >= 1:
            bucket.tokens -= 1
            return None
        return (1 - bucket.tokens) / limit.refill_per_second


def client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limited(scope: str) -> Callable[[Request], None]:
    """A dependency that answers 429 with Retry-After when the client has used up `scope`."""

    if scope not in DEFAULT_LIMITS:
        raise ValueError(f"Unknown rate limit scope: {scope}")

    def check(request: Request) -> None:
        limiter: RateLimiter = request.app.state.rate_limiter
        wait = limiter.hit(scope, client_address(request))
        if wait is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=RATE_LIMITED_MESSAGE,
                headers={"Retry-After": str(max(1, math.ceil(wait)))},
            )

    return check


class AiSlots:
    """At most `size` engine calls on behalf of requests at the same time.

    A request waits up to `wait_seconds` for a slot and then gets 503, so a burst queues
    briefly instead of piling up open calls to the engine (and Eneo sessions).
    """

    def __init__(
        self, size: int = MAX_CONCURRENT_AI_CALLS, wait_seconds: float = AI_SLOT_WAIT_SECONDS
    ) -> None:
        self._semaphore = asyncio.Semaphore(size)
        self._wait = wait_seconds

    @asynccontextmanager
    async def hold(self) -> AsyncIterator[None]:
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=self._wait)
        except TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=BUSY_MESSAGE,
                headers={"Retry-After": "30"},
            ) from exc
        try:
            yield
        finally:
            self._semaphore.release()


class BodyLimitMiddleware:
    """Refuse request bodies above `max_bytes`, except on the upload routes.

    A declared Content-Length above the cap is refused before anything is read; a body
    without one is counted while it streams, so a chunked request cannot get past it.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or any(path.match(scope["path"]) for path in UPLOAD_PATHS):
            await self.app(scope, receive, send)
            return
        declared = _content_length(scope)
        if declared is not None and declared > self.max_bytes:
            await _too_large(send)
            return

        received = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=TOO_LARGE_MESSAGE
                    )
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except HTTPException as exc:
            # FastAPI routes turn the exception into a 413 themselves; this covers the rest.
            if started or exc.status_code != status.HTTP_413_CONTENT_TOO_LARGE:
                raise
            await _too_large(send)


def _content_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            text = value.decode("latin-1").strip()
            return int(text) if text.isdigit() else None
    return None


async def _too_large(send: Send) -> None:
    body = b'{"detail":"' + TOO_LARGE_MESSAGE.encode() + b'"}'
    await send(
        {
            "type": "http.response.start",
            "status": status.HTTP_413_CONTENT_TOO_LARGE,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})
