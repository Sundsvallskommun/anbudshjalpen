"""Polite HTTP for the ingestion jobs.

Every request identifies us with `settings.http_user_agent`, has a timeout, and is retried
with exponential backoff on 429 and 5xx responses and on transport errors. A `Retry-After`
header is honoured up to the policy's maximum delay.
"""

from __future__ import annotations

import logging
import unicodedata
from asyncio import sleep
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError

log = logging.getLogger(__name__)

RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
TIMEOUT = httpx.Timeout(60.0, connect=10.0)


@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 4
    base_delay: float = 2.0
    max_delay: float = 60.0

    def delay(self, attempt: int, retry_after: str | None = None) -> float:
        backoff = self.base_delay * 2 ** (attempt - 1)
        return min(self.max_delay, max(backoff, parse_retry_after(retry_after)))


DEFAULT_RETRY = RetryPolicy()


def parse_retry_after(value: str | None, *, now: datetime | None = None) -> float:
    """Seconds requested by a `Retry-After` header (delta-seconds or HTTP date), else 0."""

    if not value:
        return 0.0
    value = value.strip()
    if value.isdigit():
        return float(value)
    try:
        moment = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, (moment - (now or datetime.now(UTC))).total_seconds())


def user_agent(settings: Settings) -> str:
    """The configured user agent, reduced to ASCII because HTTP headers must be ASCII."""

    normalized = unicodedata.normalize("NFKD", settings.http_user_agent)
    return normalized.encode("ascii", "ignore").decode("ascii")


async def send(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    settings: Settings,
    json: Any = None,
    data: Mapping[str, str] | None = None,
    params: Mapping[str, str] | None = None,
    headers: Mapping[str, str] | None = None,
    retry: RetryPolicy = DEFAULT_RETRY,
) -> httpx.Response:
    """Send one request with retries. Returns the last response, whatever its status."""

    async def attempt_once() -> httpx.Response:
        merged = {"User-Agent": user_agent(settings), **(headers or {})}
        return await client.request(
            method, url, headers=merged, json=json, data=data, params=params, timeout=TIMEOUT
        )

    for attempt in range(1, retry.attempts):
        try:
            response = await attempt_once()
        except httpx.TransportError as exc:
            delay = retry.delay(attempt)
            log.warning("%s %s failed (%s); retrying in %.0f s", method, url, exc, delay)
        else:
            if response.status_code not in RETRY_STATUSES:
                return response
            delay = retry.delay(attempt, response.headers.get("Retry-After"))
            log.warning("%s %s returned %s; retrying in %.0f s", method, url, response.status_code, delay)
        await sleep(delay)
    try:
        return await attempt_once()
    except httpx.TransportError as exc:
        raise IngestError(f"Kunde inte nå {httpx.URL(url).host} ({type(exc).__name__}).") from exc


def ensure_ok(response: httpx.Response, source: str) -> httpx.Response:
    """Raise a Swedish `IngestError` for any non-2xx response."""

    if response.is_success:
        return response
    raise IngestError(f"{source} svarade med HTTP {response.status_code} på {response.request.url}.")
