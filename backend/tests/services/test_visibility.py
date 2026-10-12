"""SHOW_FICTITIOUS=false hides the fictitious fixtures from every read, without deleting them."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar import visibility
from anbudsklar.config import Settings
from anbudsklar.mcp import reads
from anbudsklar.models import Notice
from anbudsklar.search.queries import search_notices
from anbudsklar.services.errors import NotFoundError
from anbudsklar.services.notices import get_notice


@pytest.fixture
def hide_fictitious(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = Settings().model_copy(update={"show_fictitious": False})
    monkeypatch.setattr(visibility, "get_settings", lambda: settings)
    yield


async def _notices(session: AsyncSession) -> tuple[Notice, Notice]:
    fictitious = Notice(
        source="fixture", external_id="DEMO-1", title="Påhittad målning", status="open", raw={}
    )
    fictitious.is_fictitious = True
    real = Notice(source="ted", external_id="1-2026", title="Riktig målning", status="open", raw={})
    real.is_fictitious = False
    session.add_all([fictitious, real])
    await session.flush()
    return fictitious, real


async def test_fictitious_notices_are_shown_by_default(db_session: AsyncSession) -> None:
    fictitious, _ = await _notices(db_session)

    _, total = await search_notices(db_session, text="målning")

    assert total == 2
    assert await get_notice(db_session, fictitious.id) is fictitious


@pytest.mark.usefixtures("hide_fictitious")
async def test_hidden_fictitious_notices_are_not_found_anywhere(db_session: AsyncSession) -> None:
    fictitious, real = await _notices(db_session)

    rows, total = await search_notices(db_session, text="målning")

    assert (total, [notice.id for notice in rows]) == (1, [real.id])
    with pytest.raises(NotFoundError):
        await get_notice(db_session, fictitious.id)
    assert await reads.get_notice(db_session, fictitious.id) is None
    assert await reads.get_notice(db_session, real.id) is real
