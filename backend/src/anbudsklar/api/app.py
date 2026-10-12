"""The web application: REST API under /api, MCP under /mcp and the built SPA.

`create_app()` builds everything per call and keeps no import-time state, so tests
and `uvicorn --factory` get independent instances. The lifespan owns the shared HTTP
client, the AI engine, the MCP session manager and the database engine.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from anbudsklar import __version__
from anbudsklar.ai.engine import AiEngine, EngineConfigError, EngineError, EngineOutputError
from anbudsklar.api.gate import require_gate
from anbudsklar.api.limits import AiSlots, BodyLimitMiddleware, RateLimiter
from anbudsklar.api.routers import admin, health, lab, matches, notices, profile, reminders, rules, session
from anbudsklar.api.security import ConversationStore, SessionStore, origin_of, require_same_origin
from anbudsklar.api.web import SecurityHeadersMiddleware, serve_web
from anbudsklar.config import Settings, get_settings
from anbudsklar.db import get_engine, session_scope
from anbudsklar.mcp.server import build_mcp
from anbudsklar.services.background import MatchRefresher, SessionFactory
from anbudsklar.services.errors import (
    ConflictError,
    FileTooLargeError,
    InvalidInputError,
    NotFoundError,
    ServiceError,
    UnsupportedFileError,
)
from anbudsklar.services.jobs import open_job_context
from anbudsklar.services.personas import buyer_persona_enabled
from anbudsklar.worker.mail import Mailer

logger = logging.getLogger(__name__)

_SERVICE_ERROR_STATUS: tuple[tuple[type[ServiceError], int], ...] = (
    (NotFoundError, 404),
    (ConflictError, 409),
    (FileTooLargeError, 413),
    (UnsupportedFileError, 415),
    (InvalidInputError, 422),
)
ENGINE_OUTPUT_MESSAGE = "AI-motorn gav ett svar som inte gick att tolka. Försök igen om en stund."
ENGINE_FAILED_MESSAGE = "AI-motorn kunde inte svara just nu. Försök igen om en stund."
ENGINE_CONFIG_MESSAGE = "AI-motorn är inte rätt inställd just nu. Försök igen senare."


def public_engine_message(error: EngineError) -> str:
    """What a visitor may read about an engine failure.

    Engines raise with Swedish text free of addresses and secrets, so a transient or
    permanent failure ("Eneo svarar inte", "Underlaget är för stort") is shown as is.
    Configuration problems name settings and commands that only an operator can act on,
    and the contract-failure text quotes validation details; both get a fixed message.
    """

    if isinstance(error, EngineOutputError):
        return ENGINE_OUTPUT_MESSAGE
    if isinstance(error, EngineConfigError):
        return ENGINE_CONFIG_MESSAGE
    return str(error).strip() or ENGINE_FAILED_MESSAGE


def create_app(
    settings: Settings | None = None,
    *,
    engine: AiEngine | None = None,
    mailer: Mailer | None = None,
    session_factory: SessionFactory | None = None,
) -> FastAPI:
    """Build the app. Tests pass their own engine, mailer and session factory."""

    settings = settings or get_settings()
    public_origin = origin_of(settings.public_url)
    if public_origin is None:
        raise RuntimeError("PUBLIC_URL must be an absolute http(s) URL")
    sessions = session_factory or session_scope
    mcp = build_mcp(settings, sessions=sessions)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with AsyncExitStack() as stack:
            stack.push_async_callback(get_engine().dispose)
            context = await stack.enter_async_context(
                open_job_context(settings, engine=engine, mailer=mailer)
            )
            await stack.enter_async_context(mcp.lifespan())  # mounted lifespans never run on their own
            app.state.job_context = context
            logger.info("Anbudshjälpen started with the %s engine", context.engine.name)
            yield

    app = FastAPI(
        title="Anbudshjälpen",
        version=__version__,
        lifespan=lifespan,
        docs_url=None,  # Swagger UI loads scripts from a CDN, which the CSP forbids
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.public_origin = public_origin
    app.state.sessions = SessionStore()
    app.state.rules_conversations = ConversationStore()
    app.state.session_factory = sessions
    app.state.rate_limiter = RateLimiter()
    app.state.ai_slots = AiSlots()
    app.state.match_refresher = MatchRefresher()
    app.state.buyer_persona_enabled = buyer_persona_enabled(settings)
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)  # outermost, so refusals get the headers too
    _add_error_handlers(app)

    app.include_router(health.router)
    app.include_router(_api_router())
    app.router.routes.extend(mcp.routes)  # exact /mcp and /mcp/, before the SPA fallback
    if settings.frontend_dist is not None:
        serve_web(app, settings.frontend_dist)
    return app


def _api_router() -> APIRouter:
    """Every /api route gets the same-origin check; it only acts on writes."""

    router = APIRouter(prefix="/api", dependencies=[Depends(require_same_origin), Depends(require_gate)])
    for module in (session, lab, notices, reminders, profile, matches, rules, admin):
        router.include_router(module.router)
    return router


def _add_error_handlers(app: FastAPI) -> None:
    async def service_error(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, ServiceError)
        code = next((code for kind, code in _SERVICE_ERROR_STATUS if isinstance(exc, kind)), 400)
        return JSONResponse(status_code=code, content={"detail": exc.message})

    async def engine_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, EngineError)
        # The details (the engine's own text and its cause) stay in the server log.
        logger.warning(
            "AI engine error on %s %s: %s: %s (cause: %r)",
            request.method,
            request.url.path,
            type(exc).__name__,
            exc,
            exc.__cause__,
        )
        return JSONResponse(status_code=502, content={"detail": public_engine_message(exc)})

    app.add_exception_handler(ServiceError, service_error)
    app.add_exception_handler(EngineError, engine_error)
