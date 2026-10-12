"""Aggregated question insights for buyers.

Insights never name a company. While the tender period runs, buyers only see counts;
the questions themselves are shown after the tender deadline, so that the buyer cannot
react to one supplier's questions during the tender (likabehandling, docs/architecture.md).
A restricted procedure's notice only gives the last day for anbudsansökan, after which the
tender period still runs, so its questions wait for the published checklist's sista
anbudsdag (`tender_deadline`).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import InsightItem
from anbudsklar.models import Notice, QuestionLog
from anbudsklar.services.checklists import checklist_payload, published_checklists, tender_deadline
from anbudsklar.visibility import shown_notices

SAMPLE_QUESTIONS = 5


async def list_insights(session: AsyncSession, now: datetime) -> list[InsightItem]:
    rows = (
        await session.execute(
            select(
                Notice,
                func.count(QuestionLog.id),
                func.count(case((QuestionLog.found_in_document.is_(False), 1))),
                func.count(case((QuestionLog.suggested_formal_question.is_(True), 1))),
            )
            .join(QuestionLog, QuestionLog.notice_id == Notice.id)
            .where(shown_notices())
            .group_by(Notice.id)
            .order_by(func.max(QuestionLog.created_at).desc())
        )
    ).all()
    published = await published_checklists(session, [notice.id for notice, *_ in rows])
    items: list[InsightItem] = []
    for notice, total, not_found, formal in rows:
        record = published.get(notice.id)
        deadline_at = tender_deadline(notice, checklist_payload(record) if record else None)
        visible = deadline_at is not None and deadline_at <= now
        samples = (
            (
                await session.scalars(
                    select(QuestionLog.question)
                    .where(QuestionLog.notice_id == notice.id)
                    .order_by(QuestionLog.created_at.desc())
                    .limit(SAMPLE_QUESTIONS)
                )
            ).all()
            if visible
            else []
        )
        items.append(
            InsightItem(
                notice_id=notice.id,
                notice_title=notice.title,
                deadline_at=deadline_at,
                question_count=total,
                not_in_document_count=not_found,
                formal_question_suggestions=formal,
                sample_questions=list(samples),
                visible=visible,
            )
        )
    return items
