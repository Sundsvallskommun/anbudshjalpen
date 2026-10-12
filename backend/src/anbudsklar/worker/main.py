"""The worker process: scheduled ingestion, interpretation, matching and e-mail.

One process (`anbudsklar worker`) with APScheduler's asyncio scheduler. Every run goes
through `services.jobs.run_job`, so it is recorded as a JobRun and visible to buyers
next to the runs they start by hand. A job never overlaps with itself: the scheduler
allows one instance, and `start_run` refuses a job that is already running elsewhere.
"""

from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable
from contextlib import AsyncExitStack

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.base import BaseTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from anbudsklar.config import Settings
from anbudsklar.db import get_engine, session_scope
from anbudsklar.models import CpvCode, LouSection
from anbudsklar.services.background import SessionFactory
from anbudsklar.services.dates import STOCKHOLM
from anbudsklar.services.errors import ConflictError
from anbudsklar.services.jobs import JobContext, open_job_context, run_job

logger = logging.getLogger(__name__)

JOB_DEFAULTS = {"coalesce": True, "max_instances": 1, "misfire_grace_time": 300}


def schedule() -> list[tuple[str, BaseTrigger]]:
    """When each job runs, in Stockholm time."""

    return [
        ("ingest_ted", CronTrigger(hour=6, minute=15, timezone=STOCKHOLM)),
        ("ingest_eavrop", CronTrigger(hour=6, minute=30, timezone=STOCKHOLM)),
        ("ingest_lou", CronTrigger(day_of_week="mon", hour=5, minute=0, timezone=STOCKHOLM)),
        ("close_expired", IntervalTrigger(minutes=15, timezone=STOCKHOLM)),
        ("interpret_pending", IntervalTrigger(minutes=5, timezone=STOCKHOLM)),
        ("match_all", IntervalTrigger(minutes=30, timezone=STOCKHOLM)),
        ("send_reminders", IntervalTrigger(minutes=1, timezone=STOCKHOLM)),
        ("notify_matches", IntervalTrigger(minutes=10, timezone=STOCKHOLM)),
        ("purge_lab", CronTrigger(hour=4, minute=30, timezone=STOCKHOLM)),
    ]


def build_scheduler(run_named_job: Callable[[str], Awaitable[None]]) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=STOCKHOLM, job_defaults=JOB_DEFAULTS)
    for name, trigger in schedule():
        scheduler.add_job(run_named_job, trigger, args=[name], id=name, name=name)
    return scheduler


async def run_scheduled(session_factory: SessionFactory, context: JobContext, job: str) -> None:
    try:
        await run_job(session_factory, job, context)
    except ConflictError:
        logger.info("Job %s is already running; this run is skipped", job)


async def ensure_reference_data(session_factory: SessionFactory, context: JobContext) -> None:
    """Load the CPV list and LOU on first start, so search and rule help work from day one."""

    async with session_factory() as session:
        cpv_missing = await session.scalar(select(CpvCode.code).limit(1)) is None
        lou_missing = await session.scalar(select(LouSection.id).limit(1)) is None
    if cpv_missing:
        await run_scheduled(session_factory, context, "load_cpv")
    if lou_missing:
        await run_scheduled(session_factory, context, "ingest_lou")


async def run_worker(settings: Settings) -> None:
    """Run until SIGINT or SIGTERM."""

    if not settings.scheduler_enabled:
        logger.warning("SCHEDULER_ENABLED is false; the worker has nothing to do")
        return
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for received in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(received, stop.set)

    async with AsyncExitStack() as stack:
        stack.push_async_callback(get_engine().dispose)
        context = await stack.enter_async_context(open_job_context(settings))
        await ensure_reference_data(session_scope, context)

        async def run_named_job(job: str) -> None:
            await run_scheduled(session_scope, context, job)

        scheduler = build_scheduler(run_named_job)
        scheduler.start()
        logger.info("Worker started with the %s engine", context.engine.name)
        try:
            await stop.wait()
        finally:
            scheduler.shutdown(wait=False)
    logger.info("Worker stopped")
