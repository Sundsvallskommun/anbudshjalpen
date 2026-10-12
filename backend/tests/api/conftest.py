"""Fixtures for the API tests: the real app, the heuristic engine and the test's own session."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.api.app import create_app
from anbudsklar.config import Settings
from anbudsklar.db import get_session

from .factories import PUBLIC_URL, Demo, RecordingMailer, bound_session_factory, seed_demo


@pytest.fixture
def settings(database_url: str, tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        database_url=database_url,
        public_url=PUBLIC_URL,
        documents_dir=tmp_path / "documents",
        ai_engine="heuristic",
        mcp_enabled=False,
        scheduler_enabled=False,
        # Open and without the lab, whatever the developer's .env says; the gate tests turn them on.
        access_code=None,
        lab_enabled=False,
    )


@pytest.fixture
def engine() -> AiEngine:
    return HeuristicEngine()


@pytest.fixture
def mailer() -> RecordingMailer:
    return RecordingMailer()


@pytest.fixture
async def app(
    settings: Settings, db_session: AsyncSession, engine: AiEngine, mailer: RecordingMailer
) -> AsyncIterator[FastAPI]:
    application = create_app(
        settings, engine=engine, mailer=mailer, session_factory=bound_session_factory(db_session)
    )

    async def test_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    application.dependency_overrides[get_session] = test_session
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=PUBLIC_URL, headers={"Origin": PUBLIC_URL}
    ) as http:
        yield http


@pytest.fixture
async def demo(db_session: AsyncSession) -> Demo:
    return await seed_demo(db_session)
