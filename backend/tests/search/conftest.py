"""Fixtures for the search query tests; the data lives in search_seed.py."""

from __future__ import annotations

import pytest
from search_seed import (
    Tender,
    seed_cpv_codes,
    seed_lou_sections,
    seed_notices,
    seed_policy_sections,
    seed_tender,
)
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import get_settings
from anbudsklar.ingest.policies import POLICY_DIR, load_policies
from anbudsklar.models import LouSection, Notice, PolicySection


@pytest.fixture
async def notices(db_session: AsyncSession) -> dict[str, Notice]:
    return await seed_notices(db_session)


@pytest.fixture
async def tender(db_session: AsyncSession) -> Tender:
    return await seed_tender(db_session)


@pytest.fixture
async def cpv_codes(db_session: AsyncSession) -> None:
    await seed_cpv_codes(db_session)


@pytest.fixture
async def lou_sections(db_session: AsyncSession) -> dict[str, LouSection]:
    return await seed_lou_sections(db_session)


@pytest.fixture
async def policy_sections(db_session: AsyncSession) -> dict[str, PolicySection]:
    return await seed_policy_sections(db_session)


@pytest.fixture
async def whole_strategy(db_session: AsyncSession) -> None:
    """The committed procurement strategy itself, for the routing test."""

    await load_policies(db_session, get_settings().data_dir / POLICY_DIR)
