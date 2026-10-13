"""Matching notices to companies (bedom_matchning).

Two steps, so that the result can be explained and tested (docs/architecture.md):
1. Fixed rules pick candidates: the notice's deadline has not passed (for a restricted
   procedure that is the last day for anbudsansökan, after which no new supplier can join), it is open or has
   a published checklist, and it shares a CPV group (three digits or more, or a code the
   company's broader code covers) with the company. Without a CPV match, the company's
   own words must occur in the notice (Swedish full-text search): at least two distinct
   words, and never only generic ones (`services.text`), since CPV is the primary signal.
2. The engine assesses each candidate against the published checklist. Citations are
   verified against the checklist's document before the result is stored.

An assessment is reused until the notice, the company profile or the checklist changes, or
until `ASSESSMENT_VERSION` does. `MatchRecord.created_at` is the time of the latest
assessment. A saved profile has its matches re-assessed at once (`rematch_quickly`, or after
the response with a language model), so Start does not show fits for the old profile until
the next scheduled run. A record that stops passing the prefilter is marked stale, not
deleted, so that a dismissal and the "Ny träff" e-mail are remembered if it passes again.
Each user gets at most one "Ny träff" per notice (`MatchNotification`).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime

from sqlalchemy import ColumnElement, Integer, case, cast, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, EngineError
from anbudsklar.api.schemas import MatchView
from anbudsklar.config import Settings
from anbudsklar.contracts import PagedDocument, Task, deadline_kind
from anbudsklar.cpv import CPV_DIGITS, MIN_GROUP_DIGITS, best_cpv_overlap
from anbudsklar.documents.citations import verify_match
from anbudsklar.documents.store import current_documents, load_paged_documents
from anbudsklar.models import ChecklistRecord, Company, MatchNotification, MatchRecord, Notice, User
from anbudsklar.search.queries import cpv_labels
from anbudsklar.services.access import ROLE_COMPANY, Viewer
from anbudsklar.services.ai_usage import record_call
from anbudsklar.services.checklists import PUBLISHED, checklist_payload, published_checklists
from anbudsklar.services.contexts import company_profile, notice_context
from anbudsklar.services.dates import utcnow
from anbudsklar.services.errors import NotFoundError
from anbudsklar.services.notices import match_view, notice_summaries, notice_url, page_url
from anbudsklar.services.text import keywords
from anbudsklar.visibility import shown_notices
from anbudsklar.worker.mail import Mailer, MailError, match_message

logger = logging.getLogger(__name__)

FIT_ORDER = {"passar": 0, "passar_delvis": 1, "passar_inte": 2}
# The fits worth acting on: Start's match cards, the "Ny träff" mail and the count after a profile save.
FITTING = ("passar", "passar_delvis")
ASSESSMENT_VERSION = "2026-10-05"
"""The heuristic's match rules and the bedom_matchning prompt as of this date. Change it when
either changes: assessments made under another version are made again on the next run, so their
stored texts follow the new wording (as when the engine prefix and bare CPV codes were dropped)."""
# Engines that assess without a model call, so a request can wait for them.
QUICK_ENGINES = frozenset({"heuristic"})
# More candidates than this are re-assessed in the background even with a quick engine. The
# heuristic took about 20 ms for the demo company's 41 candidates, so this stays well under a second.
MAX_QUICK_CANDIDATES = 200
# Without a CPV match, a notice must contain this many of the company's own keywords.
MIN_KEYWORD_HITS = 2
# A bound on the full-text query, not a choice of words: a 4 000-character description has
# fewer distinct words than this after the stop words.
MAX_KEYWORDS = 80
# Outcomes of one "Ny träff" e-mail.
SENT, ALREADY_SENT, FAILED = "sent", "already_sent", "failed"


@dataclass
class MatchStats:
    candidates: int = 0
    assessed: int = 0
    unchanged: int = 0
    removed: int = 0
    failed: int = 0

    def add(self, other: MatchStats) -> None:
        for item in fields(self):
            setattr(self, item.name, getattr(self, item.name) + getattr(other, item.name))

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass
class PageCache:
    """A notice's documents loaded once per run, since many companies match the same notice."""

    documents: dict[uuid.UUID, list[PagedDocument]] = field(default_factory=dict)

    async def get(self, session: AsyncSession, notice_id: uuid.UUID) -> list[PagedDocument]:
        """The notice's current documents, the checklist's citations may point into any of them."""

        if notice_id not in self.documents:
            self.documents[notice_id] = await load_paged_documents(
                session, await current_documents(session, notice_id)
            )
        return self.documents[notice_id]


def prefilter_score(
    company_codes: list[str], notice_codes: list[str], keyword_rank: float | None
) -> float | None:
    """Score in 0..1 for a candidate, or None when the fixed rules reject the notice.

    `keyword_rank` is only given for notices that passed the keyword rule (`_keyword_ranks`).
    """

    overlap = best_cpv_overlap(company_codes, notice_codes)
    cpv_score = overlap / CPV_DIGITS if overlap >= MIN_GROUP_DIGITS else 0.0
    if cpv_score == 0.0 and not keyword_rank:
        return None
    return round(max(cpv_score, min(keyword_rank or 0.0, 1.0)), 3)


async def match_all(session: AsyncSession, engine: AiEngine) -> dict[str, int]:
    companies = (await session.scalars(select(Company).order_by(Company.name))).all()
    totals = MatchStats()
    cache = PageCache()
    for company in companies:
        totals.add(await match_company(session, engine, company, cache=cache))
    return {"companies": len(companies), **totals.as_dict()}


async def match_company(
    session: AsyncSession,
    engine: AiEngine,
    company: Company,
    *,
    cache: PageCache | None = None,
    candidates: dict[uuid.UUID, tuple[Notice, float]] | None = None,
) -> MatchStats:
    """Assess the company's candidates that have no fresh assessment (`candidates` if already found)."""

    cache = cache or PageCache()
    stats = MatchStats()
    if candidates is None:
        candidates = await _candidates(session, company, utcnow())
    stats.candidates = len(candidates)
    existing = {
        record.notice_id: record
        for record in await session.scalars(select(MatchRecord).where(MatchRecord.company_id == company.id))
    }
    for notice_id, record in existing.items():
        if notice_id not in candidates and not record.stale:
            record.stale = True  # kept, so that dismissed and notified_at survive a return
            stats.removed += 1

    checklists = await published_checklists(session, list(candidates))
    labels: dict[str, str] | None = None
    for notice_id, (notice, score) in candidates.items():
        record = existing.get(notice_id)
        checklist = checklists.get(notice_id)
        if record is not None:
            record.stale = False
            if _is_fresh(record, notice, company, checklist):
                stats.unchanged += 1
                continue
        if labels is None:  # looked up once, and only when something needs an assessment
            labels = await _labels(session, company, candidates)
        try:
            await _assess(session, engine, company, notice, score, checklist, record, cache, labels)
        except EngineError:
            logger.warning("Match assessment failed for notice %s", notice_id, exc_info=True)
            stats.failed += 1
            continue
        stats.assessed += 1
    await session.flush()
    return stats


async def rematch_quickly(session: AsyncSession, engine: AiEngine, company_id: uuid.UUID) -> int | None:
    """Re-assess a company's matches in the request, after its profile was saved and committed.

    Returns how many open notices now seem to fit (`count_fitting`), or None when the caller
    should leave the work to a run after the response (`services.background.MatchRefresher`):
    a language model takes seconds per notice, an unusually long candidate list would hold the
    request, and a profile saved again meanwhile makes this run's assessments outdated. A
    failure never undoes the saved profile; it is logged and left to that run too.
    """

    if engine.name not in QUICK_ENGINES:
        return None
    try:
        done = await rematch_company(session, engine, company_id, max_candidates=MAX_QUICK_CANDIDATES)
    except Exception:
        logger.exception("Matches of company %s could not be re-assessed after a profile change", company_id)
        await session.rollback()
        return None
    return await count_fitting(session, company_id, utcnow()) if done else None


async def rematch_company(
    session: AsyncSession, engine: AiEngine, company_id: uuid.UUID, *, max_candidates: int | None = None
) -> bool:
    """Re-assess one company's matches and commit them; False when nothing was kept.

    Assessments are kept only while the profile is the one they read: when it was saved again
    during the run, the run is rolled back and returns False, so the caller assesses the new
    profile instead (otherwise the outdated results would look fresh). False also when there
    are more than `max_candidates` candidates.
    """

    company = await session.get(Company, company_id)
    if company is None:
        return True  # nothing to assess any more
    read = company.updated_at
    candidates = await _candidates(session, company, utcnow())
    if max_candidates is not None and len(candidates) > max_candidates:
        return False
    await match_company(session, engine, company, candidates=candidates)
    if await session.scalar(select(Company.updated_at).where(Company.id == company_id)) != read:
        await session.rollback()
        return False
    await session.commit()
    return True


async def count_fitting(session: AsyncSession, company_id: uuid.UUID, now: datetime) -> int:
    """How many open notices seem to fit the company: the match cards Start shows."""

    count = await session.scalar(
        select(func.count())
        .select_from(MatchRecord)
        .join(Notice, Notice.id == MatchRecord.notice_id)
        .where(
            MatchRecord.company_id == company_id,
            MatchRecord.fit.in_(FITTING),
            MatchRecord.dismissed.is_(False),
            MatchRecord.stale.is_(False),
            _deadline_ahead(now),
            shown_notices(),
        )
    )
    return count or 0


async def list_matches(session: AsyncSession, viewer: Viewer) -> list[MatchView]:
    """The company's current matches: not dismissed, still passing the prefilter, still open for tenders."""

    rows = await session.execute(
        select(MatchRecord, Notice)
        .join(Notice, Notice.id == MatchRecord.notice_id)
        .where(
            MatchRecord.company_id == viewer.company_id,
            MatchRecord.dismissed.is_(False),
            MatchRecord.stale.is_(False),
            _deadline_ahead(utcnow()),
            shown_notices(),
        )
    )
    pairs = rows.all()
    summaries = await notice_summaries(session, [notice for _, notice in pairs], viewer)
    views = [match_view(record, summary) for (record, _), summary in zip(pairs, summaries, strict=True)]
    return sorted(
        views,
        key=lambda view: (FIT_ORDER[view.fit], view.notice.deadline_at is None, view.notice.deadline_at),
    )


async def dismiss_match(session: AsyncSession, viewer: Viewer, match_id: uuid.UUID) -> None:
    """The company is not interested: the match leaves the list and gets no "Ny träff" mail."""

    (await _own_match(session, viewer, match_id)).dismissed = True
    await session.flush()


async def restore_match(session: AsyncSession, viewer: Viewer, match_id: uuid.UUID) -> None:
    """Undo a dismissal ("Ångra"); the match is listed again while it still passes the prefilter."""

    (await _own_match(session, viewer, match_id)).dismissed = False
    await session.flush()


async def _own_match(session: AsyncSession, viewer: Viewer, match_id: uuid.UUID) -> MatchRecord:
    record = await session.scalar(
        select(MatchRecord).where(MatchRecord.id == match_id, MatchRecord.company_id == viewer.company_id)
    )
    if record is None:
        raise NotFoundError("Träffen finns inte.")
    return record


async def notify_matches(
    session: AsyncSession, mailer: Mailer, settings: Settings, now: datetime
) -> dict[str, int]:
    """E-mail "Ny träff" once per user and notice for good matches, while the notice is still open.

    Every mail is claimed and committed on its own, so a failure later in the run, or a
    refused address, never makes anyone get the same mail twice. A failed mail is retried
    on the next run, for that user only. `notified_at` is set once every user has it.
    """

    rows = await session.execute(
        select(MatchRecord, Notice, Company)
        .join(Notice, Notice.id == MatchRecord.notice_id)
        .join(Company, Company.id == MatchRecord.company_id)
        .where(
            MatchRecord.fit.in_(FITTING),
            MatchRecord.notified_at.is_(None),
            shown_notices(),
            MatchRecord.dismissed.is_(False),
            MatchRecord.stale.is_(False),
            _deadline_ahead(now),
            shown_notices(),
        )
        .order_by(MatchRecord.created_at)
    )
    sent = failed = 0
    for record, notice, company in rows.all():
        users = (
            await session.scalars(
                select(User).where(User.company_id == company.id, User.role == ROLE_COMPANY)
            )
        ).all()
        if not users:
            continue
        everyone_told = True
        for user in users:
            outcome = await _send_match_mail(session, mailer, settings, record, notice, company, user, now)
            sent += outcome == SENT
            failed += outcome == FAILED
            everyone_told = everyone_told and outcome != FAILED
        if everyone_told:
            record.notified_at = now
            await session.commit()
    return {"sent": sent, "failed": failed}


async def _send_match_mail(
    session: AsyncSession,
    mailer: Mailer,
    settings: Settings,
    record: MatchRecord,
    notice: Notice,
    company: Company,
    user: User,
    now: datetime,
) -> str:
    """Claim the (user, notice) pair, then send. A failed send gives the claim back."""

    claim = await session.scalar(
        insert(MatchNotification)
        .values(id=uuid.uuid4(), user_id=user.id, notice_id=notice.id, sent_at=now)
        .on_conflict_do_nothing(constraint="uq_match_notifications_user_notice")
        .returning(MatchNotification.id)
    )
    await session.commit()
    if claim is None:
        return ALREADY_SENT
    message = match_message(
        to=user.email,
        recipient_name=user.name,
        company_name=company.name,
        notice_title=notice.title,
        notice_url=notice_url(settings.public_url, notice.id),
        fit=record.fit,
        summary=str(record.payload.get("summary", "")),
        deadline_at=notice.deadline_at,
        deadline_kind=deadline_kind(notice.deadline_kind),
        organization=settings.organization_name,
        engine=record.engine,
        start_url=page_url(settings.public_url, "start"),
    )
    try:
        await mailer.send(message)
    except MailError:
        logger.warning("Match mail %s to user %s could not be sent", record.id, user.id, exc_info=True)
        await session.execute(delete(MatchNotification).where(MatchNotification.id == claim))
        await session.commit()
        return FAILED
    return SENT


def _deadline_ahead(now: datetime) -> ColumnElement[bool]:
    """The tender period is still running (the stored status can lag behind the deadline)."""

    return or_(Notice.deadline_at.is_(None), Notice.deadline_at > now)


async def _candidates(
    session: AsyncSession, company: Company, now: datetime
) -> dict[uuid.UUID, tuple[Notice, float]]:
    published = select(ChecklistRecord.notice_id).where(ChecklistRecord.status == PUBLISHED)
    notices = (
        await session.scalars(
            select(Notice).where(
                shown_notices(), _deadline_ahead(now), or_(Notice.status == "open", Notice.id.in_(published))
            )
        )
    ).all()
    ranks = await _keyword_ranks(
        session, [notice.id for notice in notices], keywords(company.description, limit=MAX_KEYWORDS)
    )
    candidates: dict[uuid.UUID, tuple[Notice, float]] = {}
    for notice in notices:
        score = prefilter_score(
            list(company.cpv_codes or []), list(notice.cpv_codes or []), ranks.get(notice.id)
        )
        if score is not None:
            candidates[notice.id] = (notice, score)
    return candidates


async def _keyword_ranks(
    session: AsyncSession, notice_ids: list[uuid.UUID], words: list[str]
) -> dict[uuid.UUID, float]:
    """Full-text rank of the notices that contain enough distinct keywords of the company.

    One shared word is too weak a signal on its own: it is usually a word every notice
    of a kind uses. A description with a single keyword only needs that one.
    """

    if not notice_ids or not words:
        return {}
    query = func.websearch_to_tsquery("swedish", " or ".join(words))
    hits: ColumnElement[int] = sum(
        (
            cast(case((Notice.search.op("@@")(func.plainto_tsquery("swedish", word)), 1), else_=0), Integer)
            for word in words
        ),
        start=cast(0, Integer),
    )
    rows = await session.execute(
        select(Notice.id, func.ts_rank(Notice.search, query), hits).where(
            Notice.id.in_(notice_ids), Notice.search.op("@@")(query)
        )
    )
    needed = min(MIN_KEYWORD_HITS, len(words))
    return {notice_id: float(rank) for notice_id, rank, count in rows if count >= needed}


async def _labels(
    session: AsyncSession, company: Company, candidates: dict[uuid.UUID, tuple[Notice, float]]
) -> dict[str, str]:
    """CPV labels for the company's and the candidates' codes, so reasons name the work in words."""

    codes = set(company.cpv_codes or [])
    for notice, _ in candidates.values():
        codes.update(notice.cpv_codes or [])
    return await cpv_labels(session, codes)


def _is_fresh(
    record: MatchRecord, notice: Notice, company: Company, checklist: ChecklistRecord | None
) -> bool:
    if record.assessment_version != ASSESSMENT_VERSION:
        return False
    changes = [notice.updated_at, company.updated_at, checklist.published_at if checklist else None]
    return all(changed is None or record.created_at >= changed for changed in changes)


async def _assess(
    session: AsyncSession,
    engine: AiEngine,
    company: Company,
    notice: Notice,
    score: float,
    checklist: ChecklistRecord | None,
    record: MatchRecord | None,
    cache: PageCache,
    labels: dict[str, str],
) -> None:
    contract = checklist_payload(checklist) if checklist else None
    assessment, run = await engine.assess_match(
        company_profile(company, labels), notice_context(notice, labels), contract
    )
    await record_call(session, Task.ASSESS_MATCH, run, notice_id=notice.id)
    documents = await cache.get(session, notice.id) if checklist else []
    verified = verify_match(assessment, documents)
    if record is None:
        record = MatchRecord(company_id=company.id, notice_id=notice.id)
        session.add(record)
    record.fit = verified.fit
    record.prefilter_score = score
    record.engine = run.engine
    record.assessment_version = ASSESSMENT_VERSION
    record.payload = verified.model_dump(mode="json")
    record.created_at = utcnow()
