"""Shared test fixtures.

Each test session creates its own PostgreSQL database (so several agents or CI jobs can
run tests at the same time against the compose `db` service), migrates it with Alembic
and drops it afterwards. Each test runs inside a transaction that is rolled back.

Requires `docker compose up -d db` (host port 55432). Override with TEST_DATABASE_ADMIN_URL.
"""

from __future__ import annotations

import os
import subprocess
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parents[1]
ADMIN_URL = os.environ.get(
    "TEST_DATABASE_ADMIN_URL", "postgresql+asyncpg://anbudsklar:anbudsklar@localhost:55432/postgres"
)

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("AI_ENGINE", "heuristic")
os.environ.setdefault("SCHEDULER_ENABLED", "false")


def _url_for(database: str) -> str:
    base, _, _ = ADMIN_URL.rpartition("/")
    return f"{base}/{database}"


@pytest.fixture(scope="session")
def database_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    import asyncio

    name = f"anbudsklar_test_{uuid.uuid4().hex[:10]}"
    url = _url_for(name)

    async def admin(sql: str) -> None:
        engine = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            await conn.execute(text(sql))
        await engine.dispose()

    asyncio.run(admin(f'CREATE DATABASE "{name}"'))
    os.environ["DATABASE_URL"] = url
    os.environ["DOCUMENTS_DIR"] = str(tmp_path_factory.mktemp("documents"))
    # The test data is fictitious; a developer's .env that hides fixtures must not hide it here.
    os.environ["SHOW_FICTITIOUS"] = "true"
    from anbudsklar.config import get_settings

    get_settings.cache_clear()
    subprocess.run(
        ["uv", "run", "alembic", "-x", f"url={url}", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
    )
    try:
        yield url
    finally:
        asyncio.run(admin(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


@pytest.fixture
async def db_session(database_url: str) -> AsyncIterator[AsyncSession]:
    """A session whose work is rolled back after the test (savepoints for inner commits)."""

    engine = create_async_engine(database_url)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
    await engine.dispose()
