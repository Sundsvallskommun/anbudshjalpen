"""Who is asking: the viewer that every service call is scoped to."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from anbudsklar.models import User

ROLE_COMPANY = "foretagare"
ROLE_BUYER = "inkopare"


@dataclass(frozen=True)
class Viewer:
    """The signed-in user, or an anonymous visitor (all fields None).

    Company-owned data is always filtered by `company_id`, so a viewer without a
    company never sees any.
    """

    user_id: uuid.UUID | None = None
    role: str | None = None
    company_id: uuid.UUID | None = None

    @classmethod
    def anonymous(cls) -> Viewer:
        return cls()

    @classmethod
    def for_user(cls, user: User) -> Viewer:
        return cls(user_id=user.id, role=user.role, company_id=user.company_id)

    @property
    def is_buyer(self) -> bool:
        return self.role == ROLE_BUYER
