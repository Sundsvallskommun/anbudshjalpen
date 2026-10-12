"""Lab companies: workshop participants try Anbudsklar with their own company (decision 0010).

Behind the service's access code a visitor creates a company with nothing but a name,
describes it on the profile page and sees which notices seem to fit. Nobody is asked for a
name, an e-mail or an organisation number: the user row is a placeholder, so the lab holds
a company's own words about what it does and nothing about a person. The login page lists
the lab companies, so a participant finds theirs again by name, and `purge_expired` deletes
them once `LAB_RETENTION_DAYS` have passed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import LabCompanyRef, LabInfo
from anbudsklar.config import Settings
from anbudsklar.models import Company, User
from anbudsklar.services.access import ROLE_COMPANY

# The placeholder user every lab company gets: no real name, no reachable address.
PARTICIPANT_NAME = "Deltagare"


def lab_enabled(settings: Settings) -> bool:
    """Only behind the gate: without ACCESS_CODE anyone on the internet could fill the lab."""

    return settings.lab_enabled and settings.access_code is not None


async def create_lab_company(session: AsyncSession, name: str, *, now: datetime, retention_days: int) -> User:
    """A lab company with its placeholder user. The caller commits."""

    company = Company(
        name=name.strip(),
        is_fictitious=False,
        is_lab=True,
        expires_at=now + timedelta(days=retention_days),
        # Wall-clock time, not the transaction's, so the login page lists the newest first.
        created_at=now,
    )
    session.add(company)
    await session.flush()
    user = User(
        name=PARTICIPANT_NAME,
        email=f"lab-{company.id}@anbudsklar.local",
        role=ROLE_COMPANY,
        company_id=company.id,
    )
    session.add(user)
    await session.flush()
    return user


async def list_lab_companies(session: AsyncSession, *, now: datetime) -> list[LabCompanyRef]:
    """The lab companies a visitor may continue as, newest first."""

    rows = await session.scalars(
        select(Company)
        .where(Company.is_lab, Company.expires_at > now)
        .order_by(Company.created_at.desc(), Company.id)
    )
    return [LabCompanyRef(id=company.id, name=company.name) for company in rows]


async def lab_user(session: AsyncSession, company_id: uuid.UUID, *, now: datetime) -> User | None:
    """The user behind a lab company, or None when it is not a live lab company."""

    company = await session.get(Company, company_id)
    if company is None or not company.is_lab or company.expires_at is None or company.expires_at <= now:
        return None
    return await session.scalar(
        select(User).where(User.company_id == company.id).order_by(User.created_at).limit(1)
    )


def lab_info(company: Company) -> LabInfo | None:
    if not company.is_lab or company.expires_at is None:
        return None
    return LabInfo(expires_at=company.expires_at)


async def purge_expired(session: AsyncSession, now: datetime) -> int:
    """Delete lab companies past `expires_at`, with their users, matches and reminders."""

    ids = list(await session.scalars(select(Company.id).where(Company.is_lab, Company.expires_at <= now)))
    if not ids:
        return 0
    await session.execute(delete(User).where(User.company_id.in_(ids)))  # reminders cascade
    await session.execute(delete(Company).where(Company.id.in_(ids)))  # matches cascade
    return len(ids)
