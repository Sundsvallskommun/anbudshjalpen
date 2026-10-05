"""Fixtures for the ingestion tests: recorded samples, settings and an HTTP client."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from anbudsklar.config import Settings

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "ingest"
# The day the samples were recorded; deadlines in them are judged against this moment.
RECORDED_AT = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)


def read_sample(name: str) -> str:
    """A recorded response, or a skip when it is not on this machine.

    The recorded documents (TED, Riksdagen, e-Avrop) are kept out of git; see
    tests/data/ingest/README.md for how to record them.
    """

    path = DATA_DIR / name
    if not path.exists():
        pytest.skip(f"Inspelat prov saknas lokalt: {name} (se tests/data/ingest/README.md)")
    return path.read_text(encoding="utf-8")


@pytest.fixture
def settings() -> Settings:
    return Settings()


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient() as http_client:
        yield http_client


@pytest.fixture
def no_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip the waits between retries for tests that exercise retried responses."""

    async def skip(_seconds: float) -> None:
        return None

    monkeypatch.setattr("anbudsklar.ingest.http.sleep", skip)
