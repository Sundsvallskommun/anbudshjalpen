"""The company profile and CPV help. The profile is always the signed-in user's own company."""

from __future__ import annotations

import uuid
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
    ProfileChatRequest,
    ProfileChatView,
    ProfileSaved,
)
from anbudsklar.services import matching, profiles
from anbudsklar.services.access import Viewer
from anbudsklar.services.ai_usage import token_prices
from anbudsklar.services.background import MatchRefresher, SessionFactory
from anbudsklar.services.tools import tool_use

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
    fitting = await _rematch(session, engine, view.id, background, session_factory, refresher)
    return ProfileSaved(**view.model_dump(), fitting_notices=fitting)


@router.post("/profile/chat", dependencies=[Depends(rate_limited("profile_chat"))])
async def chat_profile(
    body: ProfileChatRequest,
    session: SessionDep,
    user: CompanyUserDep,
    engine: EngineDep,
    slots: AiSlotsDep,
    settings: SettingsDep,
    background: BackgroundTasks,
    session_factory: SessionFactoryDep,
    refresher: MatchRefresherDep,
) -> ProfileChatView:
    """Change the profile as a message in Fråga AI asks; a saved change re-assesses the matches."""

    async with slots.hold():
        view = await profiles.chat_update(
            session, engine, Viewer.for_user(user), body, prices=token_prices(settings)
        )
    await session.commit()
    return await after_profile_chat(view, session, engine, background, session_factory, refresher)


async def after_profile_chat(
    view: ProfileChatView,
    session: SessionDep,
    engine: EngineDep,
    background: BackgroundTasks,
    session_factory: SessionFactory,
    refresher: MatchRefresher,
) -> ProfileChatView:
    """After a message changed the profile: re-assess the matches and say so among the tools.

    Shared with Fråga AI's own endpoint (`routers.ask`), which routes a message to the
    profile the same way (decision 0026). Runs after the commit, as the form's save does.
    """

    if view.profile is None:
        return view
    fitting = await _rematch(session, engine, view.profile.id, background, session_factory, refresher)
    detail = None if fitting is None else f"{fitting} verkar passa"
    return view.model_copy(
        update={"fitting_notices": fitting, "tools": [*view.tools, tool_use("bedom_matchning", detail)]}
    )


async def _rematch(
    session: SessionDep,
    engine: EngineDep,
    company_id: uuid.UUID,
    background: BackgroundTasks,
    session_factory: SessionFactory,
    refresher: MatchRefresher,
) -> int | None:
    """Re-assess the matches now, or after the answer when the engine is slow (`rematch_quickly`)."""

    fitting = await matching.rematch_quickly(session, engine, company_id)
    if fitting is None:
        refresher.expect(company_id)
        background.add_task(refresher.run, session_factory, engine, company_id)
    return fitting


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
