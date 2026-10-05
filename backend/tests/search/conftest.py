"""Fixtures for the search query tests; the data lives in search_seed.py."""

from __future__ import annotations

import pytest
from search_seed import Tender, seed_cpv_codes, seed_lou_sections, seed_notices, seed_tender
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.models import LouSection, Notice


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
