"""The company profile and CPV help. The profile is always the signed-in user's own company."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from anbudsklar.api.deps import AiSlotsDep, CompanyUserDep, EngineDep, SessionDep, require_company_user
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import CompanyUpdate, CompanyView, CpvHit, CpvSuggestionRequest, CpvSuggestionView
from anbudsklar.services import profiles
from anbudsklar.services.access import Viewer

router = APIRouter(tags=["profile"])


@router.get("/profile")
async def get_profile(session: SessionDep, user: CompanyUserDep) -> CompanyView:
    company = await profiles.get_company(session, Viewer.for_user(user))
    return await profiles.company_view(session, company)


@router.put("/profile")
async def update_profile(body: CompanyUpdate, session: SessionDep, user: CompanyUserDep) -> CompanyView:
    view = await profiles.update_profile(session, Viewer.for_user(user), body)
    await session.commit()
    return view


@router.post(
    "/profile/cpv-suggestions",
    dependencies=[Depends(rate_limited("cpv_suggestions")), Depends(require_company_user)],
)
async def suggest_cpv(
    body: CpvSuggestionRequest, session: SessionDep, engine: EngineDep, slots: AiSlotsDep
) -> CpvSuggestionView:
    async with slots.hold():
        return await profiles.suggest_cpv(session, engine, body.description)


@router.get("/cpv")
async def search_cpv(
    session: SessionDep, q: Annotated[str, Query(min_length=2, max_length=200, description="Ord eller kod")]
) -> list[CpvHit]:
    return await profiles.cpv_hits(session, q)
