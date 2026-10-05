"""The signed-in user's reminders. Always scoped to the user's own rows."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from anbudsklar.api.deps import SessionDep, UserDep
from anbudsklar.api.schemas import ReminderView
from anbudsklar.services import reminders

router = APIRouter(tags=["reminders"])


@router.get("/reminders")
async def list_reminders(session: SessionDep, user: UserDep) -> list[ReminderView]:
    return await reminders.list_reminders(session, user.id)


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(reminder_id: uuid.UUID, session: SessionDep, user: UserDep) -> None:
    await reminders.delete_reminder(session, user.id, reminder_id)
    await session.commit()
