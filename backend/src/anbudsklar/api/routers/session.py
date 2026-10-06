"""App configuration and the PoC persona login."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from anbudsklar.api.deps import (
    BUYER_DISABLED_MESSAGE,
    BuyerEnabledDep,
    CurrentUserDep,
    EngineDep,
    SessionDep,
    SessionStoreDep,
    SettingsDep,
)
from anbudsklar.api.limits import rate_limited
from anbudsklar.api.schemas import AppConfig, LoginRequest, SessionView
from anbudsklar.api.security import SESSION_COOKIE, clear_session_cookie, set_session_cookie
from anbudsklar.services.access import ROLE_BUYER
from anbudsklar.services.personas import available_roles, list_personas, persona_user, user_view

router = APIRouter(tags=["session"])

AI_DISCLOSURE = (
    "Anbudsklar använder AI för att sammanfatta förfrågningsunderlag, svara på frågor och granska "
    "anbudsutkast. AI kan ha fel. Varje uppgift visar sida och citat så att du kan kontrollera den, "
    "och det är alltid förfrågningsunderlaget som gäller."
)
# Plain words for companies: "språkmodell" and "heuristik" are not words the company view uses.
HEURISTIC_NOTE = (
    " Just nu tas svaren fram med fasta regler i stället för AI, så de är grövre än de blir med AI."
)
DEMO_NOTICE = (
    "Det här är en demo. Företag, personer och upphandlingar märkta Fiktiv är påhittade, och "
    "inloggningen är en demoinloggning utan identifiering. "
    "Ladda inte upp riktiga anbud eller personuppgifter."
)


@router.get("/config")
async def app_config(settings: SettingsDep, engine: EngineDep) -> AppConfig:
    disclosure = AI_DISCLOSURE + (HEURISTIC_NOTE if engine.name == "heuristic" else "")
    return AppConfig(
        organization_name=settings.organization_name,
        ai_engine=engine.name,
        ai_disclosure=disclosure,
        demo_notice=DEMO_NOTICE,
        eavrop_url=settings.eavrop_base_url,
    )


@router.get("/session")
async def current_session(
    user: CurrentUserDep, session: SessionDep, response: Response, buyer_enabled: BuyerEnabledDep
) -> SessionView:
    response.headers["Cache-Control"] = "no-store"
    return SessionView(
        user=await user_view(session, user) if user else None,
        personas=await list_personas(session, available_roles(buyer_enabled=buyer_enabled)),
    )


@router.post("/session/login", dependencies=[Depends(rate_limited("login"))])
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    store: SessionStoreDep,
    buyer_enabled: BuyerEnabledDep,
) -> SessionView:
    """PoC only: sign in as a demo persona. A new session id is issued on every login.

    The buyer persona is refused where the deployment has turned it off.
    """

    if body.persona == ROLE_BUYER and not buyer_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=BUYER_DISABLED_MESSAGE)
    user = await persona_user(session, body.persona)
    previous = request.cookies.get(SESSION_COOKIE)
    if previous:
        store.delete(previous)
    set_session_cookie(response, store.create(user.id), settings)
    response.headers["Cache-Control"] = "no-store"
    personas = await list_personas(session, available_roles(buyer_enabled=buyer_enabled))
    return SessionView(user=await user_view(session, user), personas=personas)


@router.post("/session/logout", status_code=204)
async def logout(request: Request, response: Response, settings: SettingsDep, store: SessionStoreDep) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        store.delete(token)
    clear_session_cookie(response, settings)
    response.headers["Cache-Control"] = "no-store"
