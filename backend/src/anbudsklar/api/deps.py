"""FastAPI dependencies: database session, engine, current user and role guards."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.api.limits import AiSlots
from anbudsklar.api.security import SESSION_COOKIE, ConversationStore, SessionStore
from anbudsklar.config import Settings
from anbudsklar.db import get_session
from anbudsklar.models import User
from anbudsklar.services.access import ROLE_BUYER, ROLE_COMPANY, Viewer
from anbudsklar.services.background import MatchRefresher, SessionFactory
from anbudsklar.services.jobs import JobContext

BUYER_DISABLED_MESSAGE = "Inköparens demovy är avstängd i den här miljön."


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_ai_engine(request: Request) -> AiEngine:
    return request.app.state.job_context.engine


def get_job_context(request: Request) -> JobContext:
    return request.app.state.job_context


def get_session_factory(request: Request) -> SessionFactory:
    """Sessions for work that outlives the request (background interpretation and jobs)."""

    return request.app.state.session_factory


def get_session_store(request: Request) -> SessionStore:
    return request.app.state.sessions


def get_conversation_store(request: Request) -> ConversationStore:
    return request.app.state.rules_conversations


def get_ai_slots(request: Request) -> AiSlots:
    return request.app.state.ai_slots


def get_match_refresher(request: Request) -> MatchRefresher:
    """Re-assesses a company's matches after the response, one run per company at a time."""

    return request.app.state.match_refresher


def buyer_enabled(request: Request) -> bool:
    """Whether this deployment offers the buyer persona (`services.personas.buyer_persona_enabled`)."""

    return request.app.state.buyer_persona_enabled


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
EngineDep = Annotated[AiEngine, Depends(get_ai_engine)]
JobContextDep = Annotated[JobContext, Depends(get_job_context)]
SessionFactoryDep = Annotated[SessionFactory, Depends(get_session_factory)]
SessionStoreDep = Annotated[SessionStore, Depends(get_session_store)]
ConversationStoreDep = Annotated[ConversationStore, Depends(get_conversation_store)]
AiSlotsDep = Annotated[AiSlots, Depends(get_ai_slots)]
MatchRefresherDep = Annotated[MatchRefresher, Depends(get_match_refresher)]
BuyerEnabledDep = Annotated[bool, Depends(buyer_enabled)]


async def get_current_user(request: Request, session: SessionDep, store: SessionStoreDep) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    user_id = store.user_id(token) if token else None
    return await session.get(User, user_id) if user_id else None


CurrentUserDep = Annotated[User | None, Depends(get_current_user)]


def get_viewer(user: CurrentUserDep) -> Viewer:
    return Viewer.for_user(user) if user else Viewer.anonymous()


def require_user(user: CurrentUserDep) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Logga in för att fortsätta.",
            headers={"X-Auth-Required": "session"},
        )
    return user


def require_company_user(user: Annotated[User, Depends(require_user)]) -> User:
    if user.role != ROLE_COMPANY or user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Det här kräver inloggning som företagare."
        )
    return user


def require_buyer(user: Annotated[User, Depends(require_user)], enabled: BuyerEnabledDep) -> User:
    if user.role != ROLE_BUYER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Det här kräver inloggning som inköpare."
        )
    if not enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BUYER_DISABLED_MESSAGE)
    return user


ViewerDep = Annotated[Viewer, Depends(get_viewer)]
UserDep = Annotated[User, Depends(require_user)]
CompanyUserDep = Annotated[User, Depends(require_company_user)]
BuyerDep = Annotated[User, Depends(require_buyer)]
