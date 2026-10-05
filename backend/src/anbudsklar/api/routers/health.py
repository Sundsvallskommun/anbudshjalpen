"""Health checks. `/health` and `/api/healthz` never touch the database (container probes)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from anbudsklar.api.deps import SessionDep

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health", include_in_schema=False)
async def container_health() -> dict[str, bool]:
    return {"ok": True}


@router.get("/api/healthz")
async def liveness() -> dict[str, bool]:
    return {"ok": True}


@router.get("/api/health")
async def health(session: SessionDep, response: Response) -> dict[str, bool | str]:
    """Readiness including the database, for people and dashboards rather than probes."""

    try:
        await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        logger.warning("Database health check failed", exc_info=True)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"ok": False, "database": "unavailable"}
    return {"ok": True, "database": "ok"}
