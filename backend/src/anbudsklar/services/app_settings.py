"""Settings inköp changes at run time, kept in the database (decision 0011).

Environment variables are the operator's; these are the business's. Each setting is one
row, read with its default when the row is missing, so a new setting needs no migration of
data. The first one decides whether inköp reviews checklists before companies see them.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import AppSettingsUpdate, AppSettingsView
from anbudsklar.models import AppSetting
from anbudsklar.services.dates import utcnow

REVIEW_REQUIRED = "review_required"
DEFAULTS: dict[str, object] = {REVIEW_REQUIRED: True}


async def get_app_settings(session: AsyncSession) -> AppSettingsView:
    rows = await session.execute(select(AppSetting.key, AppSetting.value))
    values = DEFAULTS | {key: value for key, value in rows}
    return AppSettingsView(review_required=bool(values[REVIEW_REQUIRED]))


async def review_required(session: AsyncSession) -> bool:
    """Whether a new checklist waits for inköp, or is published the moment it is made."""

    return (await get_app_settings(session)).review_required


async def save_app_settings(
    session: AsyncSession, update: AppSettingsUpdate, user_id: uuid.UUID
) -> AppSettingsView:
    """Store every setting in `update`; the caller commits."""

    for key, value in {REVIEW_REQUIRED: update.review_required}.items():
        row = await session.get(AppSetting, key)
        if row is None:
            session.add(AppSetting(key=key, value=value, updated_by=user_id, updated_at=utcnow()))
        else:
            row.value = value
            row.updated_by = user_id
            row.updated_at = utcnow()
    await session.flush()
    return await get_app_settings(session)
