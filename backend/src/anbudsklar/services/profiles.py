"""The company profile and CPV help (foresla_cpv)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine
from anbudsklar.api.schemas import CompanyUpdate, CompanyView, CpvHit, CpvSuggestionView
from anbudsklar.contracts import CpvCandidate, CpvSuggestion, CpvSuggestions
from anbudsklar.models import Company
from anbudsklar.search.queries import cpv_labels, search_cpv
from anbudsklar.services.access import Viewer
from anbudsklar.services.cpv import normalize_cpv_codes
from anbudsklar.services.errors import InvalidInputError, NotFoundError
from anbudsklar.services.text import keywords

MAX_CANDIDATES = 40
CANDIDATES_PER_KEYWORD = 6
SUGGESTION_KEYWORDS = 8


async def get_company(session: AsyncSession, viewer: Viewer) -> Company:
    company = await session.get(Company, viewer.company_id) if viewer.company_id else None
    if company is None:
        raise NotFoundError("Det finns ingen företagsprofil för den här användaren.")
    return company


async def company_view(session: AsyncSession, company: Company) -> CompanyView:
    return CompanyView(
        id=company.id,
        org_number=company.org_number,
        name=company.name,
        description=company.description,
        cpv_codes=list(company.cpv_codes or []),
        cpv_labels=await cpv_labels(session, company.cpv_codes or []),
        municipalities=list(company.municipalities or []),
        employees=company.employees,
        annual_turnover_sek=company.annual_turnover_sek,
        certifications=list(company.certifications or []),
        insurance=company.insurance,
        public_references=company.public_references,
        is_fictitious=company.is_fictitious,
    )


async def update_profile(session: AsyncSession, viewer: Viewer, update: CompanyUpdate) -> CompanyView:
    company = await get_company(session, viewer)
    codes = normalize_cpv_codes(update.cpv_codes)
    unknown = sorted(set(codes) - set(await cpv_labels(session, codes)))
    if unknown:
        raise InvalidInputError(
            f"Okända CPV-koder: {', '.join(unknown)}. Välj koder från förslagen eller sökningen."
        )
    company.description = update.description.strip()
    company.cpv_codes = codes
    company.municipalities = _clean_list(update.municipalities)
    company.employees = update.employees
    company.annual_turnover_sek = update.annual_turnover_sek
    company.certifications = _clean_list(update.certifications)
    company.insurance = _clean_text(update.insurance)
    company.public_references = _clean_text(update.public_references)
    await session.flush()
    await session.refresh(company)
    return await company_view(session, company)


async def cpv_hits(session: AsyncSession, query: str) -> list[CpvHit]:
    return [
        CpvHit(code=row.code, label=row.label_sv, parent_code=row.parent_code)
        for row in await search_cpv(session, query.strip())
    ]


async def suggest_cpv(session: AsyncSession, engine: AiEngine, description: str) -> CpvSuggestionView:
    """Let the engine choose among codes our own search found, never codes it invents."""

    candidates = await _candidates(session, description)
    if not candidates:
        return CpvSuggestionView(suggestions=CpvSuggestions(suggestions=[]), engine=engine.name)
    result, run = await engine.suggest_cpv(description, candidates)
    labels = {candidate.code: candidate.label for candidate in candidates}
    kept = [
        CpvSuggestion(code=item.code, label=labels[item.code], reason=item.reason)
        for item in result.suggestions
        if item.code in labels
    ]
    return CpvSuggestionView(suggestions=CpvSuggestions(suggestions=kept), engine=run.engine)


async def _candidates(session: AsyncSession, description: str) -> list[CpvCandidate]:
    """CPV search per keyword: full-text search over a whole description would demand every word."""

    found: dict[str, str] = {}
    for word in keywords(description, limit=SUGGESTION_KEYWORDS):
        for row in await search_cpv(session, word, limit=CANDIDATES_PER_KEYWORD):
            found.setdefault(row.code, row.label_sv)
        if len(found) >= MAX_CANDIDATES:
            break
    return [CpvCandidate(code=code, label=label) for code, label in list(found.items())[:MAX_CANDIDATES]]


def _clean_list(values: list[str]) -> list[str]:
    cleaned: dict[str, None] = {}
    for value in values:
        if value.strip():
            cleaned.setdefault(value.strip(), None)
    return list(cleaned)


def _clean_text(value: str | None) -> str | None:
    return (value.strip() or None) if value else None
