"""Questions about a procurement document (besvara_fraga)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, QuestionTurn
from anbudsklar.api.schemas import AnswerView, QuestionRequest, QuestionTurnIn
from anbudsklar.documents.citations import verify_answer
from anbudsklar.documents.store import load_paged_document
from anbudsklar.models import Document, Notice, QuestionLog
from anbudsklar.services.access import Viewer
from anbudsklar.services.checklists import checklist_payload, key_date, visible_checklist
from anbudsklar.services.contexts import notice_context
from anbudsklar.services.dates import end_of_local_day, utcnow
from anbudsklar.services.errors import ConflictError
from anbudsklar.services.notices import first_document, formal_question_url, get_notice

# Earlier turns sent to the engine, newest first, until this many characters. The model
# needs the recent context of the conversation, not every word of it, and an anonymous
# caller must not be able to make each question cost a whole extra document.
MAX_HISTORY_CHARS = 12_000


async def ask_question(
    session: AsyncSession,
    engine: AiEngine,
    notice_id: uuid.UUID,
    request: QuestionRequest,
    viewer: Viewer,
    *,
    eavrop_url: str,
) -> AnswerView:
    """Answer from the document behind the checklist the viewer sees, and log the question.

    Companies see the published checklist, so they get answers from its document and the
    page links in the answer open that same document; without a checklist the first
    document is used. Anonymous visitors may ask; their log row has no company. Buyers'
    own test questions are not logged, and neither are questions asked after the tender
    deadline, so that insights only reflect suppliers during the tender period.
    """

    notice = await get_notice(session, notice_id)
    checklist = await visible_checklist(session, notice.id, viewer)
    document = (
        await session.get(Document, checklist.document_id) if checklist else None
    ) or await first_document(session, notice.id)
    if document is None:
        raise ConflictError("Det finns inget underlag att ställa frågor om för den här upphandlingen ännu.")
    paged = await load_paged_document(session, document.id)

    answer, run = await engine.answer_question(
        notice_context(notice), paged, request.question, bounded_history(request.history)
    )
    verified = verify_answer(answer, paged.pages)

    if not viewer.is_buyer and _tender_period_running(notice, utcnow()):
        session.add(
            QuestionLog(
                notice_id=notice.id,
                company_id=viewer.company_id,
                question=request.question,
                found_in_document=verified.found_in_document,
                suggested_formal_question=verified.suggest_formal_question,
            )
        )
        await session.flush()

    deadline = key_date(checklist_payload(checklist), "fragestopp") if checklist else None
    return AnswerView(
        answer=verified,
        engine=run.engine,
        document_id=document.id,
        question_deadline=end_of_local_day(deadline) if deadline else None,
        formal_question_url=formal_question_url(notice, eavrop_url),
    )


def bounded_history(turns: Sequence[QuestionTurnIn]) -> list[QuestionTurn]:
    """The latest turns that fit in MAX_HISTORY_CHARS, in the order they were asked."""

    kept: list[QuestionTurn] = []
    used = 0
    for turn in reversed(turns):
        used += len(turn.question) + len(turn.answer)
        if used > MAX_HISTORY_CHARS:
            break
        kept.append(QuestionTurn(question=turn.question, answer=turn.answer))
    return kept[::-1]


def _tender_period_running(notice: Notice, now: datetime) -> bool:
    return notice.deadline_at is None or notice.deadline_at > now
