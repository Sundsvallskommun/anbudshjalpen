"""Deadline reminders: created by a user, sent by the worker as e-mail.

A reminder for frågestopp or sista anbudsdag follows its deadline: when a newly
published or withdrawn checklist (or a corrected notice) moves the date, the send time
moves with it, both when the checklist changes and again just before sending. The send
time (`due_at`) and the deadline itself (`ReminderView.deadline_at`) are two different
facts, and the app and the e-mail always name the deadline as the deadline.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Mapping
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import ReminderRequest, ReminderView
from anbudsklar.config import Settings
from anbudsklar.contracts import Checklist
from anbudsklar.models import ChecklistRecord, Notice, Reminder, User
from anbudsklar.services.checklists import (
    checklist_payload,
    key_date,
    published_checklist,
    published_checklists,
)
from anbudsklar.services.dates import STOCKHOLM, end_of_local_day, local_date, local_datetime
from anbudsklar.services.errors import InvalidInputError, NotFoundError
from anbudsklar.services.notices import get_notice, notice_url, page_url
from anbudsklar.worker.mail import REMINDER_LABELS, Mailer, MailError, reminder_message

logger = logging.getLogger(__name__)

REMINDER_LEAD = timedelta(days=2)
REMINDER_TIME = time(8, 0)
SEND_BATCH_SIZE = 100
DERIVED_KINDS = ("fragestopp", "sista_anbudsdag")


def planned_due_at(deadline: date) -> datetime:
    """Two days before the deadline at 08:00 Stockholm time."""

    return local_datetime(deadline - REMINDER_LEAD, REMINDER_TIME)


def derived_due_at(deadline: date, now: datetime) -> datetime:
    """Two days before the deadline at 08:00 Stockholm time, or now if that moment has passed."""

    return max(planned_due_at(deadline), now)


def reminder_deadline(notice: Notice, kind: str, checklist: Checklist | None) -> datetime | None:
    """The deadline a reminder of this kind follows, as a moment; None for "egen" and unknown ones.

    The published checklist's date comes first, because inköp has reviewed it; the
    notice's own deadline backs up sista anbudsdag, and gives it its time of day when it
    falls on the same day. A date without a time of day lasts until that day ends in
    Stockholm, since it names the last day on which something may be done.
    """

    if kind not in DERIVED_KINDS:
        return None
    day = key_date(checklist, kind) if checklist else None
    own = notice.deadline_at if kind == "sista_anbudsdag" else None
    if day is None:
        return own
    if own is not None and local_date(own) == day:
        return own
    return end_of_local_day(day)


async def deadline_at_for(session: AsyncSession, notice: Notice, kind: str) -> datetime | None:
    if kind not in DERIVED_KINDS:
        return None
    record = await published_checklist(session, notice.id)
    return reminder_deadline(notice, kind, checklist_payload(record) if record else None)


async def deadline_for(session: AsyncSession, notice: Notice, kind: str) -> date | None:
    """The calendar day of the deadline, which the send time is planned from."""

    deadline_at = await deadline_at_for(session, notice, kind)
    return local_date(deadline_at) if deadline_at else None


async def create_reminder(
    session: AsyncSession, user_id: uuid.UUID, notice_id: uuid.UUID, request: ReminderRequest, now: datetime
) -> ReminderView:
    """Derived reminders are kept once per user, notice and kind; asking again moves the existing one."""

    notice = await get_notice(session, notice_id)
    deadline_at = await deadline_at_for(session, notice, request.kind)
    due_at = _due_at(request, deadline_at, now)

    reminder = None
    if request.kind != "egen":
        reminder = await session.scalar(
            select(Reminder).where(
                Reminder.user_id == user_id,
                Reminder.notice_id == notice.id,
                Reminder.kind == request.kind,
                Reminder.sent_at.is_(None),
            )
        )
    if reminder is None:
        reminder = Reminder(user_id=user_id, notice_id=notice.id, kind=request.kind)
        session.add(reminder)
    reminder.due_at = due_at
    reminder.note = request.note
    await session.flush()
    return _view(reminder, notice.title, deadline_at)


async def list_reminders(session: AsyncSession, user_id: uuid.UUID) -> list[ReminderView]:
    rows = (
        await session.execute(
            select(Reminder, Notice)
            .join(Notice, Notice.id == Reminder.notice_id)
            .where(Reminder.user_id == user_id)
            .order_by(Reminder.due_at, Reminder.id)
        )
    ).all()
    published = await published_checklists(session, list({notice.id for _, notice in rows}))
    return [
        _view(reminder, notice.title, _deadline_with(published, notice, reminder.kind))
        for reminder, notice in rows
    ]


def _deadline_with(
    published: Mapping[uuid.UUID, ChecklistRecord], notice: Notice, kind: str
) -> datetime | None:
    record = published.get(notice.id)
    return reminder_deadline(notice, kind, checklist_payload(record) if record else None)


async def delete_reminder(session: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID) -> None:
    reminder = await session.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user_id)
    )
    if reminder is None:
        raise NotFoundError("Påminnelsen finns inte.")
    await session.delete(reminder)
    await session.flush()


async def send_due_reminders(
    session: AsyncSession, mailer: Mailer, settings: Settings, now: datetime
) -> dict[str, int]:
    """Send reminders that are due.

    Each reminder is locked, sent and committed on its own, so two runs never send the
    same one and a failure later in the run cannot undo `sent_at` and cause a resend.
    A derived reminder whose deadline has moved later is rescheduled instead of sent.
    """

    due_ids = list(
        await session.scalars(
            select(Reminder.id)
            .where(Reminder.sent_at.is_(None), Reminder.due_at <= now)
            .order_by(Reminder.due_at)
            .limit(SEND_BATCH_SIZE)
        )
    )
    sent = failed = rescheduled = 0
    for reminder_id in due_ids:
        row = (
            await session.execute(
                select(Reminder, User, Notice)
                .join(User, User.id == Reminder.user_id)
                .join(Notice, Notice.id == Reminder.notice_id)
                .where(Reminder.id == reminder_id, Reminder.sent_at.is_(None))
                .with_for_update(of=Reminder, skip_locked=True)
            )
        ).first()
        if row is None:
            continue  # sent or locked by another run
        reminder, user, notice = row
        deadline_at = await deadline_at_for(session, notice, reminder.kind)
        if deadline_at is not None and planned_due_at(local_date(deadline_at)) > now:
            reminder.due_at = planned_due_at(local_date(deadline_at))
            await session.commit()
            rescheduled += 1
            continue
        message = reminder_message(
            to=user.email,
            recipient_name=user.name,
            notice_title=notice.title,
            notice_url=notice_url(settings.public_url, notice.id),
            kind=reminder.kind,
            deadline_at=deadline_at,
            note=reminder.note,
            organization=settings.organization_name,
            reminders_url=page_url(settings.public_url, "paminnelser"),
        )
        try:
            await mailer.send(message)
        except MailError:
            logger.warning("Reminder %s could not be sent", reminder.id, exc_info=True)
            await session.commit()  # nothing changed; releases the lock, and the next run retries
            failed += 1
            continue
        reminder.sent_at = now
        await session.commit()
        sent += 1
    return {"sent": sent, "failed": failed, "rescheduled": rescheduled}


async def reschedule_for_notice(session: AsyncSession, notice_id: uuid.UUID, now: datetime) -> int:
    """Move unsent frågestopp and sista anbudsdag reminders to follow the current deadlines.

    Called when a checklist is published or withdrawn. A reminder whose deadline is no
    longer known keeps its time; the mail then names no date.
    """

    notice = await get_notice(session, notice_id)
    reminders = (
        await session.scalars(
            select(Reminder).where(
                Reminder.notice_id == notice.id,
                Reminder.sent_at.is_(None),
                Reminder.kind.in_(DERIVED_KINDS),
            )
        )
    ).all()
    moved = 0
    for reminder in reminders:
        deadline = await deadline_for(session, notice, reminder.kind)
        if deadline is None:
            continue
        due_at = derived_due_at(deadline, now)
        if due_at != reminder.due_at:
            reminder.due_at = due_at
            moved += 1
    await session.flush()
    return moved


def _due_at(request: ReminderRequest, deadline_at: datetime | None, now: datetime) -> datetime:
    if request.kind == "egen":
        if request.due_at is None:
            raise InvalidInputError("Ange datum och tid för påminnelsen.")
        due_at = request.due_at if request.due_at.tzinfo else request.due_at.replace(tzinfo=STOCKHOLM)
        if due_at <= now:
            raise InvalidInputError("Välj en tidpunkt som inte redan har passerat.")
        return due_at

    label = REMINDER_LABELS[request.kind]
    if deadline_at is None:
        raise InvalidInputError(
            f"{label} finns inte i den publicerade checklistan. Skapa en egen påminnelse i stället."
        )
    if deadline_at <= now:
        raise InvalidInputError(f"{label} har redan passerat.")
    return derived_due_at(local_date(deadline_at), now)


def _view(reminder: Reminder, notice_title: str, deadline_at: datetime | None) -> ReminderView:
    return ReminderView.model_validate(
        {
            "id": reminder.id,
            "notice_id": reminder.notice_id,
            "notice_title": notice_title,
            "kind": reminder.kind,
            "note": reminder.note,
            "due_at": reminder.due_at,
            "deadline_at": deadline_at,
            "sent_at": reminder.sent_at,
        }
    )
