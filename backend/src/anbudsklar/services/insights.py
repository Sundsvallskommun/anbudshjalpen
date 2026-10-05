"""Aggregated question insights for buyers.

Insights never name a company. While the tender period runs, buyers only see counts;
the questions themselves are shown after the deadline, so that the buyer cannot react
to one supplier's questions during the tender (likabehandling, docs/architecture.md).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.api.schemas import InsightItem
from anbudsklar.models import Notice, QuestionLog

SAMPLE_QUESTIONS = 5


async def list_insights(session: AsyncSession, now: datetime) -> list[InsightItem]:
    rows = await session.execute(
        select(
            Notice.id,
            Notice.title,
            Notice.deadline_at,
            func.count(QuestionLog.id),
            func.count(case((QuestionLog.found_in_document.is_(False), 1))),
            func.count(case((QuestionLog.suggested_formal_question.is_(True), 1))),
        )
        .join(QuestionLog, QuestionLog.notice_id == Notice.id)
        .group_by(Notice.id)
        .order_by(func.max(QuestionLog.created_at).desc())
    )
    items: list[InsightItem] = []
    for notice_id, title, deadline_at, total, not_found, formal in rows:
        visible = deadline_at is not None and deadline_at <= now
        samples = (
            (
                await session.scalars(
                    select(QuestionLog.question)
                    .where(QuestionLog.notice_id == notice_id)
                    .order_by(QuestionLog.created_at.desc())
                    .limit(SAMPLE_QUESTIONS)
                )
            ).all()
            if visible
            else []
        )
        items.append(
            InsightItem(
                notice_id=notice_id,
                notice_title=title,
                deadline_at=deadline_at,
                question_count=total,
                not_in_document_count=not_found,
                formal_question_suggestions=formal,
                sample_questions=list(samples),
                visible=visible,
            )
        )
    return items
