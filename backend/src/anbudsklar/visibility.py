"""Whether fictitious demo data is shown (`SHOW_FICTITIOUS`).

The fixtures are fictitious notices, documents and agreements made for the demo journey. Once
real data comes from TED and e-Avrop, they can be hidden without deleting them: every read
of notices and agreements applies these conditions. The demo personas and their companies
stay, because the PoC's login is built on them (decision 0007).
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, true

from anbudsklar.config import get_settings
from anbudsklar.models import Agreement, Notice


def show_fictitious() -> bool:
    return get_settings().show_fictitious


def shown_notices() -> ColumnElement[bool]:
    """A condition that keeps the notices that may be shown."""

    return true() if show_fictitious() else Notice.is_fictitious.is_(False)


def shown_agreements() -> ColumnElement[bool]:
    return true() if show_fictitious() else Agreement.is_fictitious.is_(False)


def is_shown(notice: Notice) -> bool:
    return show_fictitious() or not notice.is_fictitious
