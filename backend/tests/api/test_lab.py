"""Lab mode (decision 0010): your own company behind the gate, listed on the login page, and the purge."""

from __future__ import annotations

from datetime import timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.security import SESSION_COOKIE
from anbudsklar.config import Settings
from anbudsklar.models import Company, MatchRecord, Notice, User
from anbudsklar.services.dates import utcnow
from anbudsklar.services.lab import create_lab_company, purge_expired

from .factories import Demo

CODE = "workshop-2026"


@pytest.fixture
def settings(settings: Settings) -> Settings:
    return settings.model_copy(
        update={"access_code": SecretStr(CODE), "lab_enabled": True, "lab_retention_days": 30}
    )


@pytest.fixture(autouse=True)
async def through_the_gate(client: httpx.AsyncClient) -> None:
    assert (await client.post("/api/gate", json={"code": CODE})).status_code == 204


async def test_config_says_the_lab_is_on(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/config")).json()["lab_enabled"] is True


async def test_a_participant_creates_a_company_and_is_signed_in(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    response = await client.post("/api/lab/companies", json={"name": " Fiktiv Måleri AB "})

    assert response.status_code == 201, response.text
    assert response.headers["set-cookie"].startswith(f"{SESSION_COOKIE}=")
    body = response.json()
    user = body["user"]
    assert user["role"] == "foretagare"
    assert user["name"] == "Deltagare"
    assert user["company"]["name"] == "Fiktiv Måleri AB"
    assert user["lab"]["expires_at"]
    # The company has no identity beyond its name, and the profile is theirs to fill in.
    company = await db_session.get(Company, user["company"]["id"])
    assert company is not None and company.is_lab and not company.is_fictitious and company.org_number is None
    profile = await client.get("/api/profile")
    assert profile.status_code == 200 and profile.json()["description"] == ""
    # The demo personas are untouched, and the company is now on the login page.
    assert [persona["key"] for persona in body["personas"]] == ["foretagare", "inkopare"]
    assert [item["name"] for item in body["lab_companies"]] == ["Fiktiv Måleri AB"]


async def test_the_login_page_lists_lab_companies_to_continue_as(
    client: httpx.AsyncClient, db_session: AsyncSession, demo: Demo
) -> None:
    now = utcnow()
    first = await create_lab_company(
        db_session, "Första bolaget", now=now - timedelta(hours=1), retention_days=30
    )
    await create_lab_company(db_session, "Andra bolaget", now=now, retention_days=30)
    await create_lab_company(db_session, "Utgånget bolag", now=now - timedelta(days=31), retention_days=30)
    await db_session.flush()

    listed = (await client.get("/api/session")).json()["lab_companies"]
    assert [item["name"] for item in listed] == ["Andra bolaget", "Första bolaget"]

    signed_in = await client.post("/api/lab/sessions", json={"company_id": str(first.company_id)})
    assert signed_in.status_code == 200, signed_in.text
    assert signed_in.json()["user"]["company"]["name"] == "Första bolaget"
    assert (await client.get("/api/profile")).status_code == 200
    # The seeded demo company is not a lab company, so it cannot be continued as this way.
    refused = await client.post("/api/lab/sessions", json={"company_id": str(demo.company.id)})
    assert refused.status_code == 404


async def test_expired_companies_are_purged_with_what_belongs_to_them(
    db_session: AsyncSession, demo: Demo
) -> None:
    now = utcnow()
    expired = await create_lab_company(
        db_session, "Gammalt bolag", now=now - timedelta(days=31), retention_days=30
    )
    fresh = await create_lab_company(db_session, "Nytt bolag", now=now, retention_days=30)
    assert expired.company_id is not None
    db_session.add(
        MatchRecord(
            company_id=expired.company_id,
            notice_id=demo.notice.id,
            fit="passar",
            prefilter_score=0.5,
            engine="heuristic",
            assessment_version="test",
            payload={},
        )
    )
    await db_session.flush()

    deleted = await purge_expired(db_session, now)

    assert deleted == 1
    assert await db_session.get(Company, expired.company_id) is None
    assert await db_session.get(User, expired.id) is None
    assert await db_session.scalar(select(func.count()).select_from(MatchRecord)) == 0
    assert await db_session.get(Company, fresh.company_id) is not None
    assert await db_session.get(Company, demo.company.id) is not None  # the seeded demo company stays
    assert await db_session.get(Notice, demo.notice.id) is not None


class TestLabOff:
    @pytest.fixture
    def settings(self, settings: Settings) -> Settings:
        return settings.model_copy(update={"lab_enabled": False})

    async def test_the_lab_is_not_offered_or_reachable(self, client: httpx.AsyncClient, demo: Demo) -> None:
        assert (await client.get("/api/config")).json()["lab_enabled"] is False
        assert (await client.get("/api/session")).json()["lab_companies"] == []
        created = await client.post("/api/lab/companies", json={"name": "Testbolag"})
        assert created.status_code == 404
        continued = await client.post("/api/lab/sessions", json={"company_id": str(demo.company.id)})
        assert continued.status_code == 404
