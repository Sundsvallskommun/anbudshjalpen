"""Regelhjälpen: general questions about procurement rules. Open to everyone; no question is stored.

A conversation continues only in the browser that started it (`ConversationStore`). What
is committed is the record of the call for the statistics on Drift, never the question.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from anbudsklar.api.deps import AiSlotsDep, ConversationStoreDep, EngineDep, SessionDep, SettingsDep
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import RulesRequest, RulesView
from anbudsklar.api.security import RULES_COOKIE, conversation_owner, set_rules_cookie
from anbudsklar.services import rules
from anbudsklar.services.ai_usage import token_prices

router = APIRouter(tags=["rules"])


@router.post("/rules/ask", dependencies=[Depends(rate_limited("rules"))])
async def ask_rules(
    body: RulesRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    engine: EngineDep,
    slots: AiSlotsDep,
    settings: SettingsDep,
    conversations: ConversationStoreDep,
) -> RulesView:
    owner = conversation_owner(request.cookies.get(RULES_COOKIE))
    session_id = str(body.session_id) if body.session_id else None
    if session_id is not None and not conversations.belongs_to(session_id, owner):
        session_id = None  # expired, or handed to another browser: start a new conversation
    async with slots.hold():
        view = await rules.ask_rules(
            session, engine, body.question, session_id, prices=token_prices(settings)
        )
    await session.commit()
    if view.answer.session_id:
        conversations.bind(view.answer.session_id, owner)
    set_rules_cookie(response, owner, settings)
    response.headers["Cache-Control"] = "no-store"
    return view
