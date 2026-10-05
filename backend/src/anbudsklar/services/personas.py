"""Demo personas for the PoC login.

PoC only: signing in means picking a seeded demo user, with no identification at all.
Production uses the municipality's e-ID and a check that the person may represent the
company (decision 0007).
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import CompanyRef, Persona, Role, UserView
from anbudsklar.config import Settings
from anbudsklar.models import Company, User
from anbudsklar.services.access import ROLE_BUYER, ROLE_COMPANY
from anbudsklar.services.errors import NotFoundError

ROLES: tuple[Role, ...] = ("foretagare", "inkopare")
_DESCRIPTIONS = {
    ROLE_COMPANY: "Företagare som letar efter upphandlingar, ställer frågor och granskar sitt anbudsutkast.",
    ROLE_BUYER: "Inköpare som granskar, godkänner och publicerar checklistor.",
}


async def persona_user(session: AsyncSession, role: Role) -> User:
    user = await session.scalar(
        select(User).where(User.role == role).order_by(User.created_at, User.email).limit(1)
    )
    if user is None:
        raise NotFoundError("Demoanvändaren finns inte. Lägg in demodata med `anbudsklar seed`.")
    return user


def buyer_persona_enabled(settings: Settings) -> bool:
    """Whether anyone may pick the buyer persona, and with it publish to companies and Eneo.

    The buyer approves what companies and Eneo's assistants read as reviewed by inköp, so
    on a shared deployment the role must not be open to every visitor. DEMO_BUYER_ENABLED
    decides; when it is not set, the persona is offered everywhere except in production
    (the Dokploy test environment), where an operator turns it on only behind basic auth
    or an IP allowlist (docs/operations.md).
    """

    if settings.demo_buyer_enabled is not None:
        return settings.demo_buyer_enabled
    return settings.environment != "production"


def available_roles(*, buyer_enabled: bool) -> tuple[Role, ...]:
    return ROLES if buyer_enabled else tuple(role for role in ROLES if role != ROLE_BUYER)


async def list_personas(session: AsyncSession, roles: Sequence[Role] = ROLES) -> list[Persona]:
    """Only personas that exist in the database and may be picked, so that every choice can sign in."""

    personas: list[Persona] = []
    for role in roles:
        try:
            user = await persona_user(session, role)
        except NotFoundError:
            continue
        company = await session.get(Company, user.company_id) if user.company_id else None
        label = f"{user.name}, {company.name}" if company else f"{user.name}, {_title(role)}"
        personas.append(Persona(key=role, label=label, description=_DESCRIPTIONS[role]))
    return personas


async def user_view(session: AsyncSession, user: User) -> UserView:
    company = await session.get(Company, user.company_id) if user.company_id else None
    return UserView.model_validate(
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "company": CompanyRef(id=company.id, name=company.name) if company else None,
        }
    )


def _title(role: Role) -> str:
    return "inköpare" if role == ROLE_BUYER else "företagare"
