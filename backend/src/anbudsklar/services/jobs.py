"""Background jobs and their bookkeeping (JobRun).

The same jobs run on the worker's schedule, from the CLI and from the buyer's "run now"
button. A run is recorded before the job starts and finished in a separate session, so
the record survives when the job itself fails and rolls back.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, EngineError, build_engine
from anbudsklar.api.schemas import JobRunView
from anbudsklar.config import Settings
from anbudsklar.ingest import ingest_eavrop, ingest_lou, ingest_ted, load_cpv
from anbudsklar.ingest.common import IngestError
from anbudsklar.ingest.http import user_agent
from anbudsklar.models import JobRun
from anbudsklar.services.background import SessionFactory
from anbudsklar.services.checklists import interpret_answered, interpret_pending
from anbudsklar.services.dates import utcnow
from anbudsklar.services.errors import ConflictError, ServiceError
from anbudsklar.services.lab import purge_expired
from anbudsklar.services.matching import match_all, notify_matches
from anbudsklar.services.notices import close_expired_notices
from anbudsklar.services.reminders import send_due_reminders
from anbudsklar.worker.mail import Mailer, SmtpMailer

logger = logging.getLogger(__name__)

RUNNING = "running"
OK = "ok"
FAILED = "failed"
# A run still marked as running after this long belongs to a process that died.
STALE_AFTER = timedelta(hours=2)
MAX_ERROR_CHARS = 2000
HTTP_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
TECHNICAL_ERROR = "Tekniskt fel ({name}). Detaljerna finns i loggen."


@dataclass(frozen=True)
class JobContext:
    """Long-lived resources a job may use, owned by the app or worker lifespan."""

    settings: Settings
    http: httpx.AsyncClient
    engine: AiEngine
    mailer: Mailer


JobFunction = Callable[[AsyncSession, JobContext], Awaitable[Mapping[str, int]]]


@asynccontextmanager
async def open_job_context(
    settings: Settings, *, engine: AiEngine | None = None, mailer: Mailer | None = None
) -> AsyncIterator[JobContext]:
    """Create the shared resources and close them afterwards (app lifespan, worker, CLI)."""

    async with httpx.AsyncClient(
        timeout=HTTP_TIMEOUT, headers={"User-Agent": user_agent(settings)}, follow_redirects=False
    ) as http:
        ai = engine or build_engine(settings.ai_engine)
        try:
            yield JobContext(settings=settings, http=http, engine=ai, mailer=mailer or SmtpMailer(settings))
        finally:
            await ai.aclose()


def cpv_csv_path(settings: Settings) -> Path:
    return settings.data_dir / "cpv" / "cpv_2008_sv.csv"


def agreements_csv_path(settings: Settings) -> Path:
    return settings.data_dir / "fixtures" / "agreements.csv"


async def _ingest_ted(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return await ingest_ted(session, ctx.http, ctx.settings)


async def _ingest_eavrop(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    since = await last_fetching_start(session, "ingest_eavrop")
    return await ingest_eavrop(session, ctx.http, ctx.settings, changed_since=since)


async def ingest_eavrop_full(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    """Fetch every project again, for instance after a change to what the ingestion reads."""

    return await ingest_eavrop(session, ctx.http, ctx.settings)


async def _ingest_lou(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return await ingest_lou(session, ctx.http, ctx.settings)


async def _load_cpv(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return {"loaded": await load_cpv(session, cpv_csv_path(ctx.settings))}


async def _close_expired(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return await close_expired_notices(session, utcnow())


async def _interpret_pending(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    """New documents first, then checklists whose published answers changed (decision 0018)."""

    return {**await interpret_pending(session, ctx.engine), **await interpret_answered(session, ctx.engine)}


async def _match_all(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return await match_all(session, ctx.engine)


async def _send_reminders(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return await send_due_reminders(session, ctx.mailer, ctx.settings, utcnow())


async def _notify_matches(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return await notify_matches(session, ctx.mailer, ctx.settings, utcnow())


async def _purge_lab(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
    return {"deleted": await purge_expired(session, utcnow())}


JOBS: dict[str, JobFunction] = {
    "ingest_ted": _ingest_ted,
    "ingest_eavrop": _ingest_eavrop,
    "ingest_lou": _ingest_lou,
    "load_cpv": _load_cpv,
    "close_expired": _close_expired,
    "interpret_pending": _interpret_pending,
    "match_all": _match_all,
    "send_reminders": _send_reminders,
    "notify_matches": _notify_matches,
    "purge_lab": _purge_lab,
}


async def last_fetching_start(session: AsyncSession, job: str) -> datetime | None:
    """When the job's latest successful run that fetched something started.

    For jobs that fetch only what changed since then. A run that fetched nothing does not
    count: e-Avrop's earlier list scraper ran daily without fetching (robots.txt), and a run
    without the API token fetches nothing either.
    """

    fetched = JobRun.stats["fetched"].as_integer()
    return await session.scalar(
        select(JobRun.started_at)
        .where(JobRun.job == job, JobRun.status == OK, fetched > 0)
        .order_by(JobRun.started_at.desc())
        .limit(1)
    )


async def start_run(session: AsyncSession, job: str) -> JobRun:
    """Record a new run, refusing to start a job that is already running."""

    running = await session.scalar(
        select(JobRun.id)
        .where(JobRun.job == job, JobRun.status == RUNNING, JobRun.started_at > utcnow() - STALE_AFTER)
        .limit(1)
    )
    if running is not None:
        raise ConflictError("Jobbet körs redan. Vänta tills det är klart.")
    run = JobRun(job=job, status=RUNNING, started_at=utcnow(), stats={})
    session.add(run)
    await session.flush()
    return run


async def complete_run(
    session_factory: SessionFactory, run_id: uuid.UUID, job: str, function: JobFunction, ctx: JobContext
) -> None:
    """Execute the job in its own session, then record the outcome in another."""

    stats: dict[str, int] = {}
    error: str | None = None
    try:
        async with session_factory() as session:
            stats = dict(await function(session, ctx))
    except Exception as exc:
        logger.exception("Job %s failed", job)
        error = run_error_message(exc)
    async with session_factory() as session:
        run = await session.get(JobRun, run_id)
        if run is None:
            return
        run.status = FAILED if error else OK
        run.stats = stats
        run.error = error
        run.finished_at = utcnow()
    logger.info("Job %s finished: %s %s", job, FAILED if error else OK, stats)


async def run_job(
    session_factory: SessionFactory, job: str, ctx: JobContext, function: JobFunction | None = None
) -> uuid.UUID:
    """Start and complete a run in the caller's task (worker and CLI). Returns the run id.

    `function` runs a job that is not in the registry under its own name, such as
    loading agreements from a file the CLI user chose.
    """

    async with session_factory() as session:
        run_id = (await start_run(session, job)).id
    await complete_run(session_factory, run_id, job, function or JOBS[job], ctx)
    return run_id


def run_error_message(error: Exception) -> str:
    """What the buyer's job list shows about a failed run.

    Our own errors carry Swedish text written to be shown. Anything else, such as a
    database error that quotes SQL and its parameters, stays in the log.
    """

    if isinstance(error, ServiceError):
        message = error.message
    elif isinstance(error, IngestError | EngineError):
        message = str(error)
    else:
        message = ""
    return (message.strip() or TECHNICAL_ERROR.format(name=type(error).__name__))[:MAX_ERROR_CHARS]


async def latest_runs(session: AsyncSession) -> list[JobRunView]:
    """The latest run of every job that has run, newest first.

    Per job rather than the most recent runs overall: the frequent jobs would otherwise
    push the daily and weekly ones out of the list within the hour.
    """

    runs = await session.scalars(
        select(JobRun).ext(distinct_on(JobRun.job)).order_by(JobRun.job, JobRun.started_at.desc(), JobRun.id)
    )
    latest = sorted(runs, key=lambda run: run.started_at, reverse=True)
    return [JobRunView.model_validate(run) for run in latest]
