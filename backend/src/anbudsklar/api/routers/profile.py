"""The company profile and CPV help. The profile is always the signed-in user's own company."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from anbudsklar.api.deps import (
    AiSlotsDep,
    CompanyUserDep,
    EngineDep,
    MatchRefresherDep,
    SessionDep,
    SessionFactoryDep,
    SettingsDep,
    require_company_user,
)
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import (
    CompanyUpdate,
    CompanyView,
    CpvHit,
    CpvSuggestionRequest,
    CpvSuggestionView,
    ProfileSaved,
)
from anbudsklar.services import matching, profiles
from anbudsklar.services.access import Viewer
from anbudsklar.services.ai_usage import token_prices

router = APIRouter(tags=["profile"])


@router.get("/profile")
async def get_profile(session: SessionDep, user: CompanyUserDep) -> CompanyView:
    company = await profiles.get_company(session, Viewer.for_user(user))
    return await profiles.company_view(session, company)


@router.put("/profile")
async def update_profile(
    body: CompanyUpdate,
    session: SessionDep,
    user: CompanyUserDep,
    engine: EngineDep,
    background: BackgroundTasks,
    session_factory: SessionFactoryDep,
    refresher: MatchRefresherDep,
) -> ProfileSaved:
    """Save the profile and re-assess the company's matches against it.

    The heuristic engine re-assesses them before the answer, which then says how many open
    notices seem to fit (`fitting_notices`). A language model takes seconds per notice, so
    with it the matches are re-assessed after the answer and `fitting_notices` is null.
    """

    view = await profiles.update_profile(session, Viewer.for_user(user), body)
    await session.commit()
    fitting = await matching.rematch_quickly(session, engine, view.id)
    if fitting is None:
        refresher.expect(view.id)
        background.add_task(refresher.run, session_factory, engine, view.id)
    return ProfileSaved(**view.model_dump(), fitting_notices=fitting)


@router.post(
    "/profile/cpv-suggestions",
    dependencies=[Depends(rate_limited("cpv_suggestions")), Depends(require_company_user)],
)
async def suggest_cpv(
    body: CpvSuggestionRequest,
    session: SessionDep,
    engine: EngineDep,
    slots: AiSlotsDep,
    settings: SettingsDep,
) -> CpvSuggestionView:
    """The commit keeps the record of the two calls for the statistics on Drift; the profile is untouched."""

    async with slots.hold():
        view = await profiles.suggest_cpv(session, engine, body.description, prices=token_prices(settings))
    await session.commit()
    return view


@router.get("/cpv")
async def search_cpv(
    session: SessionDep, q: Annotated[str, Query(min_length=2, max_length=200, description="Ord eller kod")]
) -> list[CpvHit]:
    return await profiles.cpv_hits(session, q)
