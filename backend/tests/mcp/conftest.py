"""Fixtures for the MCP tests."""

from __future__ import annotations

import pytest
from mcp_harness import Seeded, seed
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
async def seeded(db_session: AsyncSession) -> Seeded:
    return await seed(db_session)
