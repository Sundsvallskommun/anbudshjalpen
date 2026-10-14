"""Fråga AI: one endpoint for every message, whichever subject answers it (decision 0026).

Open to everyone, like the questions about a notice and Regelhjälpen that it routes to;
the profile is a subject only for a signed-in company, and `services.ask` offers it to
nobody else. Regelhjälpen's conversation cookie is read and renewed here as on its own
endpoint, so a conversation continues only in the browser that started it.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response

from anbudsklar.api.deps import (
    AiSlotsDep,
    ConversationStoreDep,
    EngineDep,
    MatchRefresherDep,
    SessionDep,
    SessionFactoryDep,
    SettingsDep,
    ViewerDep,
)
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.routers.profile import after_profile_chat
from anbudsklar.api.schemas import AskRequest, AskView
from anbudsklar.api.security import RULES_COOKIE, conversation_owner, set_rules_cookie
from anbudsklar.services import ask as ask_service
from anbudsklar.services.ai_usage import token_prices

router = APIRouter(tags=["ask"])


@router.post("/ask", dependencies=[Depends(rate_limited("ask"))])
async def ask(
    body: AskRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    engine: EngineDep,
    viewer: ViewerDep,
    settings: SettingsDep,
    slots: AiSlotsDep,
    conversations: ConversationStoreDep,
    background: BackgroundTasks,
    session_factory: SessionFactoryDep,
    refresher: MatchRefresherDep,
) -> AskView:
    owner = conversation_owner(request.cookies.get(RULES_COOKIE))
    rules_session_id = str(body.rules_session_id) if body.rules_session_id else None
    if rules_session_id is not None and not conversations.belongs_to(rules_session_id, owner):
        rules_session_id = None  # expired, or handed to another browser: start a new conversation
    async with slots.hold():
        view = await ask_service.ask(
            session,
            engine,
            body,
            viewer,
            rules_session_id=rules_session_id,
            eavrop_url=settings.eavrop_base_url,
            prices=token_prices(settings),
        )
    await session.commit()
    if view.rules is not None and view.rules.answer.session_id:
        conversations.bind(view.rules.answer.session_id, owner)
    set_rules_cookie(response, owner, settings)
    response.headers["Cache-Control"] = "no-store"
    if view.profile is not None:
        profile = await after_profile_chat(
            view.profile, session, engine, background, session_factory, refresher
        )
        view = view.model_copy(update={"profile": profile})
    return view
