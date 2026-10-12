"""Lab mode: create your own company, and continue as one from the login page (decision 0010)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.deps import BuyerEnabledDep, SessionDep, SessionStoreDep, SettingsDep
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import LabCreateRequest, LabLoginRequest, SessionView
from anbudsklar.api.security import SESSION_COOKIE, SessionStore, set_session_cookie
from anbudsklar.config import Settings
from anbudsklar.models import User
from anbudsklar.services.dates import utcnow
from anbudsklar.services.lab import create_lab_company, lab_enabled, lab_user, list_lab_companies
from anbudsklar.services.personas import available_roles, list_personas, user_view

router = APIRouter(prefix="/lab", tags=["lab"])

LAB_DISABLED_MESSAGE = "Labbläget är inte påslaget."
UNKNOWN_COMPANY_MESSAGE = "Testföretaget finns inte längre. Det kan ha raderats."


def _require_lab(settings: Settings) -> None:
    if not lab_enabled(settings):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LAB_DISABLED_MESSAGE)


async def _sign_in(
    user: User,
    request: Request,
    response: Response,
    session: AsyncSession,
    settings: Settings,
    store: SessionStore,
    buyer_enabled: bool,
) -> SessionView:
    """The same session as the persona login gives: a new id, the old one forgotten."""

    previous = request.cookies.get(SESSION_COOKIE)
    if previous:
        store.delete(previous)
    set_session_cookie(response, store.create(user.id), settings)
    response.headers["Cache-Control"] = "no-store"
    return SessionView(
        user=await user_view(session, user),
        personas=await list_personas(session, available_roles(buyer_enabled=buyer_enabled)),
        lab_companies=await list_lab_companies(session, now=utcnow()),
    )


@router.post("/companies", status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limited("lab"))])
async def create_company(
    body: LabCreateRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    store: SessionStoreDep,
    buyer_enabled: BuyerEnabledDep,
) -> SessionView:
    """Create a lab company and sign in as its participant (the gate has let the visitor in)."""

    _require_lab(settings)
    user = await create_lab_company(
        session, body.name, now=utcnow(), retention_days=settings.lab_retention_days
    )
    await session.commit()
    return await _sign_in(user, request, response, session, settings, store, buyer_enabled)


@router.post("/sessions", dependencies=[Depends(rate_limited("login"))])
async def continue_as(
    body: LabLoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    store: SessionStoreDep,
    buyer_enabled: BuyerEnabledDep,
) -> SessionView:
    """Sign in as a lab company picked on the login page."""

    _require_lab(settings)
    user = await lab_user(session, body.company_id, now=utcnow())
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=UNKNOWN_COMPANY_MESSAGE)
    return await _sign_in(user, request, response, session, settings, store, buyer_enabled)
