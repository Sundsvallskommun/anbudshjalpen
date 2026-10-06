"""Matches for the signed-in company, and upcoming procurements from the agreement catalogue."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from anbudsklar.api.deps import CompanyUserDep, SessionDep, ViewerDep
from anbudsklar.api.schemas import MatchView, UpcomingProcurement
from anbudsklar.models import Company
from anbudsklar.services import matching, upcoming
from anbudsklar.services.access import Viewer
from anbudsklar.services.dates import local_date, utcnow

router = APIRouter(tags=["matches"])


@router.get("/matches")
async def list_matches(session: SessionDep, user: CompanyUserDep) -> list[MatchView]:
    return await matching.list_matches(session, Viewer.for_user(user))


@router.post("/matches/{match_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_match(match_id: uuid.UUID, session: SessionDep, user: CompanyUserDep) -> None:
    await matching.dismiss_match(session, Viewer.for_user(user), match_id)
    await session.commit()


@router.post("/matches/{match_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def restore_match(match_id: uuid.UUID, session: SessionDep, user: CompanyUserDep) -> None:
    """Undo "Inte intressant"."""

    await matching.restore_match(session, Viewer.for_user(user), match_id)
    await session.commit()


@router.get("/upcoming")
async def list_upcoming(
    session: SessionDep, viewer: ViewerDep, months: Annotated[int, Query(ge=1, le=36)] = 18
) -> list[UpcomingProcurement]:
    """Public; a signed-in company also sees which ones match its CPV codes."""

    company = await session.get(Company, viewer.company_id) if viewer.company_id else None
    return await upcoming.list_upcoming(
        session,
        months=months,
        today=local_date(utcnow()),
        company_codes=list(company.cpv_codes or []) if company else None,
    )
