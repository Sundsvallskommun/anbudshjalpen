"""Which deadline a reminder is about, as a moment: the reviewed checklist first, the notice's time of day."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import ReminderRequest
from anbudsklar.contracts import Checklist
from anbudsklar.models import Notice
from anbudsklar.services.dates import STOCKHOLM, end_of_local_day
from anbudsklar.services.errors import InvalidInputError
from anbudsklar.services.reminders import create_reminder, reminder_deadline
from api.factories import demo_checklist, seed_demo

QUESTIONS = date(2026, 10, 30)
TENDERS = date(2026, 11, 9)
NOTICE_DEADLINE = datetime(2026, 11, 9, 12, 0, tzinfo=STOCKHOLM)
REQUESTS = datetime(2026, 10, 20, 23, 59, 59, tzinfo=STOCKHOLM)


def _notice(deadline_at: datetime | None = NOTICE_DEADLINE, deadline_kind: str = "tender") -> Notice:
    return Notice(title="Ommålning (fiktiv)", deadline_at=deadline_at, deadline_kind=deadline_kind)


SOURCE_QUESTIONS = datetime(2026, 10, 28, 23, 59, 59, tzinfo=STOCKHOLM)


def _from_eavrop() -> Notice:
    """A notice whose source states the last day for questions (e-Avrop's time table)."""

    notice = _notice()
    notice.question_deadline_at = SOURCE_QUESTIONS
    return notice


def _restricted() -> Notice:
    """A restricted procedure: the notice's deadline is the last day for anbudsansökan."""

    return _notice(REQUESTS, "request")


def _checklist(tenders: date = TENDERS) -> Checklist:
    return demo_checklist(QUESTIONS, tenders)


@pytest.mark.parametrize(
    ("kind", "notice", "checklist", "expected"),
    [
        ("fragestopp", _notice(), _checklist(), end_of_local_day(QUESTIONS)),
        ("fragestopp", _notice(), None, None),  # without a source date, only a published checklist knows it
        ("fragestopp", _from_eavrop(), _checklist(), SOURCE_QUESTIONS),  # the source's date beats the model's
        ("fragestopp", _from_eavrop(), None, SOURCE_QUESTIONS),
        ("sista_anbudsdag", _notice(), _checklist(), NOTICE_DEADLINE),  # same day: the notice's time
        (
            "sista_anbudsdag",
            _notice(),
            _checklist(TENDERS + timedelta(days=1)),
            end_of_local_day(TENDERS + timedelta(days=1)),
        ),
        ("sista_anbudsdag", _notice(), None, NOTICE_DEADLINE),
        ("sista_anbudsdag", _notice(None), _checklist(), end_of_local_day(TENDERS)),
        ("sista_anbudsdag", _notice(None), None, None),
        ("egen", _notice(), _checklist(), None),
        ("anbudsansokan", _notice(), _checklist(), None),  # the notice's deadline is for tenders
        # A restricted procedure: anbudsansökan follows the notice, sista anbudsdag the checklist alone.
        ("anbudsansokan", _restricted(), None, REQUESTS),
        ("anbudsansokan", _restricted(), _checklist(), REQUESTS),
        ("sista_anbudsdag", _restricted(), None, None),
        ("sista_anbudsdag", _restricted(), _checklist(), end_of_local_day(TENDERS)),
    ],
)
def test_reminder_deadline(
    kind: str, notice: Notice, checklist: Checklist | None, expected: datetime | None
) -> None:
    assert reminder_deadline(notice, kind, checklist) == expected


async def test_no_reminder_for_a_deadline_that_passed_earlier_today(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    demo.notice.deadline_at = datetime.combine(
        demo.deadline, datetime.min.time(), tzinfo=STOCKHOLM
    ) + timedelta(hours=12)
    await db_session.flush()
    request = ReminderRequest(kind="sista_anbudsdag")
    one_pm = demo.notice.deadline_at + timedelta(hours=1)  # the same day, an hour after the deadline
    with pytest.raises(InvalidInputError, match="Sista anbudsdag har redan passerat"):
        await create_reminder(db_session, demo.company_user.id, demo.notice.id, request, one_pm)
    eleven = demo.notice.deadline_at - timedelta(hours=1)
    reminder = await create_reminder(db_session, demo.company_user.id, demo.notice.id, request, eleven)
    assert reminder.due_at == eleven  # too late for two days ahead: it goes now
    assert reminder.deadline_at == demo.notice.deadline_at


async def test_a_restricted_procedure_reminds_about_anbudsansokan(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    demo.notice.deadline_kind = "request"
    await db_session.flush()
    now = demo.notice.deadline_at - timedelta(days=10) if demo.notice.deadline_at else None
    assert now is not None

    reminder = await create_reminder(
        db_session, demo.company_user.id, demo.notice.id, ReminderRequest(kind="anbudsansokan"), now
    )

    assert reminder.kind == "anbudsansokan"
    assert reminder.deadline_at == demo.notice.deadline_at


async def test_no_anbudsansokan_reminder_for_a_tender_deadline(db_session: AsyncSession) -> None:
    demo = await seed_demo(db_session)
    with pytest.raises(InvalidInputError, match="Sista dag för anbudsansökan finns inte i annonsen"):
        await create_reminder(
            db_session,
            demo.company_user.id,
            demo.notice.id,
            ReminderRequest(kind="anbudsansokan"),
            datetime.now(STOCKHOLM),
        )
