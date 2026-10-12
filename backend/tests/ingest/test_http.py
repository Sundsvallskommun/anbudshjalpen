"""Polite HTTP: user agent, retries with backoff, Retry-After and error messages."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
import respx

from anbudsklar.config import Settings
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.http import RetryPolicy, ensure_ok, parse_retry_after, send, user_agent

URL = "https://example.test/data"
NO_WAIT = RetryPolicy(attempts=3, base_delay=0, max_delay=0)


def test_user_agent_is_ascii_even_when_configured_with_swedish_letters() -> None:
    settings = Settings(http_user_agent="Anbudshjalpen-PoC/0.1 (näringslivsenheten, Sundsvall)")

    assert user_agent(settings) == "Anbudshjalpen-PoC/0.1 (naringslivsenheten, Sundsvall)"


def test_retry_after_accepts_seconds_and_http_dates() -> None:
    now = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)

    assert parse_retry_after("7") == 7.0
    assert parse_retry_after("Mon, 05 Oct 2026 12:00:30 GMT", now=now) == 30.0
    assert parse_retry_after("soon") == 0.0
    assert parse_retry_after(None) == 0.0


def test_backoff_doubles_honours_retry_after_and_is_capped() -> None:
    policy = RetryPolicy(attempts=4, base_delay=2, max_delay=60)

    assert [policy.delay(attempt) for attempt in (1, 2, 3)] == [2, 4, 8]
    assert policy.delay(1, "20") == 20
    assert policy.delay(1, "3600") == 60


async def test_send_retries_server_errors_and_sends_the_user_agent(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    route = respx_mock.get(URL).mock(
        side_effect=[httpx.Response(503), httpx.Response(429), httpx.Response(200, text="ok")]
    )

    response = await send(client, "GET", URL, settings=settings, retry=NO_WAIT)

    assert response.text == "ok"
    assert route.call_count == 3
    assert route.calls.last.request.headers["User-Agent"] == user_agent(settings)


async def test_send_returns_the_last_error_response_when_retries_run_out(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    respx_mock.get(URL).mock(return_value=httpx.Response(502))

    response = await send(client, "GET", URL, settings=settings, retry=NO_WAIT)

    assert response.status_code == 502


async def test_send_does_not_retry_client_errors(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    route = respx_mock.get(URL).mock(return_value=httpx.Response(404))

    response = await send(client, "GET", URL, settings=settings, retry=NO_WAIT)

    assert response.status_code == 404
    assert route.call_count == 1


async def test_send_turns_repeated_transport_errors_into_a_swedish_error(
    respx_mock: respx.MockRouter, client: httpx.AsyncClient, settings: Settings
) -> None:
    route = respx_mock.get(URL).mock(side_effect=httpx.ConnectError("refused"))

    with pytest.raises(IngestError, match=r"Kunde inte nå example\.test"):
        await send(client, "GET", URL, settings=settings, retry=NO_WAIT)
    assert route.call_count == 3


def test_ensure_ok_names_the_source_and_status() -> None:
    response = httpx.Response(500, request=httpx.Request("GET", URL))

    with pytest.raises(IngestError, match="TED svarade med HTTP 500"):
        ensure_ok(response, "TED")
