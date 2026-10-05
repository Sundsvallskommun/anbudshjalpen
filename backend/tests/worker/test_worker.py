"""The schedule, reference data on first start and the reminder job."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.heuristic import HeuristicEngine
from anbudsklar.config import Settings
from anbudsklar.models import JobRun, Reminder
from anbudsklar.services import jobs
from anbudsklar.services.jobs import JobContext, JobFunction
from anbudsklar.services.reminders import planned_due_at, send_due_reminders
from anbudsklar.worker.main import build_scheduler, ensure_reference_data, run_scheduled
from api.factories import (
    PUBLIC_URL,
    RecordingMailer,
    add_cpv_codes,
    bound_session_factory,
    demo_checklist,
    seed_demo,
    today,
)


async def test_schedule_matches_the_plan() -> None:
    async def run(job: str) -> None:
        return None

    scheduler = build_scheduler(run)
    triggers = {job.id: job.trigger for job in scheduler.get_jobs()}
    assert set(triggers) == {
        "ingest_ted",
        "ingest_eavrop",
        "ingest_lou",
        "close_expired",
        "interpret_pending",
        "match_all",
        "send_reminders",
        "notify_matches",
    }
    assert set(triggers) <= set(jobs.JOBS)
    assert isinstance(triggers["ingest_ted"], CronTrigger)
    assert "hour='6'" in str(triggers["ingest_ted"]) and "minute='15'" in str(triggers["ingest_ted"])
    assert "day_of_week='mon'" in str(triggers["ingest_lou"])
    assert isinstance(triggers["send_reminders"], IntervalTrigger)
    assert triggers["send_reminders"].interval == timedelta(minutes=1)
    assert triggers["interpret_pending"].interval == timedelta(minutes=5)
    assert triggers["close_expired"].interval == timedelta(minutes=15)
    assert triggers["match_all"].interval == timedelta(minutes=30)
    assert triggers["notify_matches"].interval == timedelta(minutes=10)


@pytest.fixture
def context() -> JobContext:
    return JobContext(
        settings=Settings(public_url=PUBLIC_URL),
        http=httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(500))),
        engine=HeuristicEngine(),
        mailer=RecordingMailer(),
    )


async def test_reference_data_is_loaded_once(
    db_session: AsyncSession, context: JobContext, monkeypatch: pytest.MonkeyPatch
) -> None:
    loaded: list[str] = []

    def recorder(name: str) -> JobFunction:
        async def job(session: AsyncSession, ctx: JobContext) -> Mapping[str, int]:
            loaded.append(name)
            return {"loaded": 1}

        return job

    monkeypatch.setitem(jobs.JOBS, "load_cpv", recorder("load_cpv"))
    monkeypatch.setitem(jobs.JOBS, "ingest_lou", recorder("ingest_lou"))
    factory = bound_session_factory(db_session)

    await ensure_reference_data(factory, context)
    assert loaded == ["load_cpv", "ingest_lou"]

    await add_cpv_codes(db_session, {"45442100": "Målning"})
    loaded.clear()
    await ensure_reference_data(factory, context)
    assert loaded == ["ingest_lou"]


async def test_a_scheduled_run_skips_a_job_that_is_already_running(
    db_session: AsyncSession, context: JobContext
) -> None:
    db_session.add(JobRun(job="match_all", status="running", started_at=datetime.now(UTC), stats={}))
    await db_session.flush()
    await run_scheduled(bound_session_factory(db_session), context, "match_all")
    runs = (await db_session.scalars(select(JobRun).where(JobRun.job == "match_all"))).all()
    assert len(runs) == 1


async def test_due_reminders_are_sent_once(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    fragestopp = today() + timedelta(days=1)  # inside the two days of lead time
    demo.checklist.payload = demo_checklist(fragestopp, demo.deadline).model_dump(mode="json")
    now = datetime.now(UTC)
    due = Reminder(
        user_id=demo.company_user.id,
        notice_id=demo.notice.id,
        kind="fragestopp",
        due_at=now - timedelta(minutes=1),
    )
    later = Reminder(
        user_id=demo.company_user.id, notice_id=demo.notice.id, kind="egen", due_at=now + timedelta(days=1)
    )
    db_session.add_all([due, later])
    await db_session.flush()
    settings = Settings(public_url=PUBLIC_URL)
    mailer = RecordingMailer()

    assert await send_due_reminders(db_session, mailer, settings, now) == {
        "sent": 1,
        "failed": 0,
        "rescheduled": 0,
    }
    [message] = mailer.sent
    assert message.to == "anna@example.test"
    assert message.subject.startswith("Frågestopp ")
    assert demo.notice.title in message.subject
    assert due.sent_at == now
    assert later.sent_at is None

    assert (await send_due_reminders(db_session, mailer, settings, now))["sent"] == 0


async def test_unsent_reminders_are_retried(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    now = datetime.now(UTC)
    reminder = Reminder(
        user_id=demo.company_user.id, notice_id=demo.notice.id, kind="egen", note="Ring", due_at=now
    )
    db_session.add(reminder)
    await db_session.flush()
    settings = Settings(public_url=PUBLIC_URL)

    assert await send_due_reminders(db_session, RecordingMailer(fail=True), settings, now) == {
        "sent": 0,
        "failed": 1,
        "rescheduled": 0,
    }
    assert reminder.sent_at is None
    assert (await send_due_reminders(db_session, RecordingMailer(), settings, now))["sent"] == 1


async def test_a_reminder_follows_a_deadline_that_moved_later(db_session: AsyncSession) -> None:
    """The checklist now says frågestopp is in 20 days; a reminder planned for an earlier date waits."""

    demo = await seed_demo(db_session)
    now = datetime.now(UTC)
    reminder = Reminder(
        user_id=demo.company_user.id,
        notice_id=demo.notice.id,
        kind="fragestopp",
        due_at=now - timedelta(minutes=1),
    )
    db_session.add(reminder)
    await db_session.flush()
    mailer = RecordingMailer()
    settings = Settings(public_url=PUBLIC_URL)

    stats = await send_due_reminders(db_session, mailer, settings, now)
    assert stats == {"sent": 0, "failed": 0, "rescheduled": 1}
    assert mailer.sent == []
    assert reminder.sent_at is None
    assert reminder.due_at == planned_due_at(demo.fragestopp)
