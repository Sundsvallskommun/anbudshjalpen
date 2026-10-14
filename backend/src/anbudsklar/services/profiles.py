"""The company profile, CPV help (foresla_cpv) and changes to the profile from Fråga AI (uppdatera_profil)."""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, EngineRun
from anbudsklar.api.schemas import (
    CompanyUpdate,
    CompanyView,
    CpvHit,
    CpvSuggestionView,
    ProfileChangeItem,
    ProfileChatRequest,
    ProfileChatView,
)
from anbudsklar.contracts import CpvCandidate, CpvSuggestion, CpvSuggestions, ProfileChange, Task
from anbudsklar.cpv import cpv_prefix
from anbudsklar.models import Company
from anbudsklar.search.queries import cpv_areas, cpv_descendants, cpv_labels, search_cpv
from anbudsklar.services.access import Viewer
from anbudsklar.services.ai_usage import TokenPrices, combined_usage, record_call, usage_view
from anbudsklar.services.contexts import company_profile
from anbudsklar.services.cpv import normalize_cpv_codes
from anbudsklar.services.errors import InvalidInputError, NotFoundError
from anbudsklar.services.questions import bounded_history
from anbudsklar.services.text import keywords
from anbudsklar.services.tools import engine_tools, tool_use

# The areas (CPV divisions and groups) the engine picks first, and how many exact codes
# under them it then sees. 400 lines is a few thousand tokens; the largest group alone has
# 613 codes, so broad codes come first and the narrowest fall off.
MAX_AREAS = 8
MAX_AREA_CODES = 400
# A profile code with fewer significant digits than this is a whole division ("Transporter"),
# which would match every notice under it. A group is as broad as a profile gets.
MIN_PROFILE_DIGITS = 3
# The keyword search over labels, kept as a supplement in case the areas miss something.
MAX_CANDIDATES = 40
CANDIDATES_PER_KEYWORD = 6
SUGGESTION_KEYWORDS = 40  # a bound on the number of searches, not a choice of words


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
        cpv_divisions=await cpv_divisions(session),
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


async def cpv_divisions(session: AsyncSession) -> dict[str, str]:
    """The 45 divisions of the CPV list, by code: the areas the profile groups its codes under."""

    return {area.code: area.label_sv for area in await cpv_areas(session) if len(cpv_prefix(area.code)) <= 2}


async def cpv_hits(session: AsyncSession, query: str) -> list[CpvHit]:
    return [
        CpvHit(code=row.code, label=row.label_sv, parent_code=row.parent_code)
        for row in await search_cpv(session, query.strip())
    ]


async def suggest_cpv(
    session: AsyncSession, engine: AiEngine, description: str, *, prices: TokenPrices | None = None
) -> CpvSuggestionView:
    """Let the engine choose among codes from the official list, never codes it invents.

    Two calls. First the engine picks the areas the company works in (CPV divisions and
    groups) from the whole list of them, so that meaning decides: a search over the labels
    alone never gets from "renoverar badrum" to "Plattsättning". Then it picks the exact
    codes under those areas. The codes the keyword search finds are offered as well, in
    case the areas missed one. The view's usage is the sum of the two calls.
    """

    areas, runs = await _areas(session, engine, description)
    labels: dict[str, str] = {}
    for row in await cpv_descendants(session, [area.code for area in areas], limit=MAX_AREA_CODES):
        if len(cpv_prefix(row.code)) >= MIN_PROFILE_DIGITS:
            labels[row.code] = row.label_sv
    for candidate in await _candidates(session, description):
        if len(cpv_prefix(candidate.code)) >= MIN_PROFILE_DIGITS:
            labels.setdefault(candidate.code, candidate.label)
    candidates = [CpvCandidate(code=code, label=label) for code, label in labels.items()]
    if not candidates:
        return CpvSuggestionView(suggestions=CpvSuggestions(suggestions=[]), engine=engine.name)
    result, run = await engine.suggest_cpv(description, candidates)
    await record_call(session, Task.SUGGEST_CPV, run)
    runs.append(run)
    labels = {candidate.code: candidate.label for candidate in candidates}
    kept = [
        CpvSuggestion(code=item.code, label=labels[item.code], reason=item.reason)
        for item in result.suggestions
        if item.code in labels
    ]
    usage = combined_usage(runs)
    return CpvSuggestionView(
        suggestions=CpvSuggestions(suggestions=kept),
        engine=run.engine,
        usage=usage_view(EngineRun(engine=run.engine, usage=usage), prices),
    )


async def _areas(
    session: AsyncSession, engine: AiEngine, description: str
) -> tuple[list[CpvSuggestion], list[EngineRun]]:
    """The areas the engine picks from the whole list of divisions and groups, and the run behind them."""

    areas = await cpv_areas(session)
    if not areas:
        return [], []
    result, run = await engine.suggest_cpv(
        description, [CpvCandidate(code=area.code, label=area.label_sv) for area in areas]
    )
    await record_call(session, Task.SUGGEST_CPV, run)
    known = {area.code for area in areas}
    return [item for item in result.suggestions if item.code in known][:MAX_AREAS], [run]


async def _candidates(session: AsyncSession, description: str) -> list[CpvCandidate]:
    """CPV search per keyword: full-text search over a whole description would demand every word."""

    found: dict[str, str] = {}
    for word in keywords(description, limit=SUGGESTION_KEYWORDS):
        for row in await search_cpv(session, word, limit=CANDIDATES_PER_KEYWORD):
            found.setdefault(row.code, row.label_sv)
        if len(found) >= MAX_CANDIDATES:
            break
    return [CpvCandidate(code=code, label=label) for code, label in list(found.items())[:MAX_CANDIDATES]]


# --- Changes from Fråga AI (uppdatera_profil) ---------------------------------------

CHANGE_LABELS: dict[str, str] = {
    "description": "Beskrivning",
    "cpv_codes": "CPV-koder",
    "municipalities": "Verksamhetsorter",
    "employees": "Antal anställda",
    "annual_turnover_sek": "Årsomsättning",
    "certifications": "Certifieringar",
    "insurance": "Försäkring",
    "public_references": "Uppdrag för offentliga köpare",
}
NOTHING_TO_CHANGE = (
    "Jag hittade inget i meddelandet som ändrar profilen. Skriv vad som ska ändras, så gör jag det."
)


async def chat_update(
    session: AsyncSession,
    engine: AiEngine,
    viewer: Viewer,
    request: ProfileChatRequest,
    *,
    prices: TokenPrices | None = None,
) -> ProfileChatView:
    """Change the profile as a message in Fråga AI asks, through the profile's own validation.

    The engine only reads the wish (`ProfileChange`); this code applies it with
    `update_profile`, so a CPV code must come from our search's candidates and the
    message can never reach the database as anything but a profile field. A question
    back, or a message that changes nothing, saves nothing. The caller commits and
    re-assesses the matches as after a save from the form.
    """

    company = await get_company(session, viewer)
    labels = await cpv_labels(session, company.cpv_codes or [])
    profile = company_profile(company, labels)
    candidates = await _candidates(session, request.message)
    found = _counted(len(candidates), "kandidat", "kandidater")
    tools = [tool_use("hamta_profil"), tool_use("sok_cpv", found)]
    change, run = await engine.update_profile(
        profile, candidates, bounded_history(request.history), request.message
    )
    await record_call(session, Task.UPDATE_PROFILE, run)
    tools += [tool_use("tolka_meddelande"), *engine_tools(run)]

    def view(
        applied: bool, reply: str, changes: list[ProfileChangeItem], saved: CompanyView | None
    ) -> ProfileChatView:
        return ProfileChatView(
            reply=reply,
            applied=applied,
            changes=changes,
            profile=saved,
            engine=run.engine,
            usage=usage_view(run, prices),
            tools=tools,
        )

    if change.needs_clarification:
        return view(False, change.reply, [], None)
    all_labels = {**labels, **{candidate.code: candidate.label for candidate in candidates}}
    update, changes = apply_change(company, change, candidates, all_labels)
    if not changes:
        return view(False, change.reply or NOTHING_TO_CHANGE, [], None)
    saved = await update_profile(session, viewer, update)
    tools.append(tool_use("spara_profil"))
    return view(True, change.reply, changes, saved)


def apply_change(
    company: Company, change: ProfileChange, candidates: list[CpvCandidate], labels: Mapping[str, str]
) -> tuple[CompanyUpdate, list[ProfileChangeItem]]:
    """The profile with the change applied, and what differs, for the panel to show.

    A field the change leaves as None keeps its value; an empty string clears a text.
    Codes to add must be candidates and codes to remove must be in the profile; the rest
    are dropped rather than refused, because the model already told the company what it
    does in `reply`, and what was saved is shown next to it.
    """

    allowed = {candidate.code for candidate in candidates}
    codes = list(company.cpv_codes or [])
    for code in change.cpv_remove:
        if code in codes:
            codes.remove(code)
    codes += [code for code in change.cpv_add if code in allowed and code not in codes]

    def keep[T](current: T, wanted: T | None) -> T:
        return current if wanted is None else wanted

    update = CompanyUpdate(
        description=keep(company.description, change.description),
        cpv_codes=codes,
        municipalities=keep(list(company.municipalities or []), change.municipalities),
        employees=keep(company.employees, change.employees),
        annual_turnover_sek=keep(company.annual_turnover_sek, change.annual_turnover_sek),
        certifications=keep(list(company.certifications or []), change.certifications),
        insurance=keep(company.insurance, change.insurance),
        public_references=keep(company.public_references, change.public_references),
    )
    before = {
        "description": company.description,
        "cpv_codes": _cpv_text(company.cpv_codes or [], labels),
        "municipalities": _list_text(company.municipalities or []),
        "employees": _number_text(company.employees),
        "annual_turnover_sek": _money_text(company.annual_turnover_sek),
        "certifications": _list_text(company.certifications or []),
        "insurance": _clean_text(company.insurance),
        "public_references": _clean_text(company.public_references),
    }
    after = {
        "description": update.description.strip(),
        "cpv_codes": _cpv_text(codes, labels),
        "municipalities": _list_text(_clean_list(update.municipalities)),
        "employees": _number_text(update.employees),
        "annual_turnover_sek": _money_text(update.annual_turnover_sek),
        "certifications": _list_text(_clean_list(update.certifications)),
        "insurance": _clean_text(update.insurance),
        "public_references": _clean_text(update.public_references),
    }
    changes = [
        ProfileChangeItem(field=name, label=CHANGE_LABELS[name], before=before[name], after=after[name])
        for name in CHANGE_LABELS
        if before[name] != after[name]
    ]
    return update, changes


def _cpv_text(codes: list[str], labels: Mapping[str, str]) -> str | None:
    return ", ".join(f"{code} {labels[code]}" if code in labels else code for code in codes) or None


def _list_text(values: list[str]) -> str | None:
    return ", ".join(values) or None


def _number_text(value: int | None) -> str | None:
    return None if value is None else f"{value:,}".replace(",", " ")


def _money_text(value: int | None) -> str | None:
    return None if value is None else f"{_number_text(value)} kr"


def _counted(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _clean_list(values: list[str]) -> list[str]:
    cleaned: dict[str, None] = {}
    for value in values:
        if value.strip():
            cleaned.setdefault(value.strip(), None)
    return list(cleaned)


def _clean_text(value: str | None) -> str | None:
    return (value.strip() or None) if value else None
