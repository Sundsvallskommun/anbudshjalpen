"""Questions about a procurement's documents (besvara_fraga)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, QuestionTurn
from anbudsklar.api.schemas import AnswerView, QuestionRequest, QuestionTurnIn, ReadSummary
from anbudsklar.contracts import Checklist, DocumentSet, Task
from anbudsklar.documents.bundle import PageRef, build_document_set
from anbudsklar.documents.citations import verify_answer
from anbudsklar.documents.store import current_documents, load_paged_documents
from anbudsklar.models import Document, Notice, QuestionLog
from anbudsklar.search.queries import search_document
from anbudsklar.services.access import Viewer
from anbudsklar.services.ai_usage import TokenPrices, record_call, usage_view
from anbudsklar.services.answers import answer_inputs
from anbudsklar.services.checklists import checklist_payload, tender_deadline, visible_checklist
from anbudsklar.services.contexts import notice_context, unread_filenames
from anbudsklar.services.dates import utcnow
from anbudsklar.services.errors import ConflictError
from anbudsklar.services.notices import first_document, formal_question_url, get_notice, question_deadline

# Earlier turns sent to the engine, newest first, until this many characters. The model
# needs the recent context of the conversation, not every word of it, and an anonymous
# caller must not be able to make each question cost a whole extra document.
MAX_HISTORY_CHARS = 12_000
# Pages our search offers the bundle when the documents do not all fit (decision 0012).
MAX_SEARCH_HITS = 40


async def ask_question(
    session: AsyncSession,
    engine: AiEngine,
    notice_id: uuid.UUID,
    request: QuestionRequest,
    viewer: Viewer,
    *,
    eavrop_url: str,
    prices: TokenPrices | None = None,
) -> AnswerView:
    """Answer from the procurement's documents and the buyer's published answers, and log the question.

    The main document is the one behind the checklist the viewer sees (companies see the
    published one), else the first document; every other document of the notice follows it.
    `build_document_set` decides how much of them the engine reads. Anonymous visitors may
    ask; their log row has no company. Buyers' own test questions are not logged, and
    neither are questions asked after the tender deadline, so that insights only reflect
    suppliers during the tender period.
    """

    notice = await get_notice(session, notice_id)
    checklist = await visible_checklist(session, notice.id, viewer)
    main = (
        await session.get(Document, checklist.document_id) if checklist else None
    ) or await first_document(session, notice.id)
    if main is None:
        raise ConflictError("Det finns inget underlag att ställa frågor om för den här upphandlingen ännu.")
    documents = await load_paged_documents(session, await current_documents(session, notice.id, main=main))
    hits = await search_document(session, notice.id, request.question, limit=MAX_SEARCH_HITS)
    document_set = build_document_set(
        documents,
        hits=[PageRef(str(hit.document_id), hit.page_no) for hit in hits],
        unread_files=unread_filenames(notice),
    )

    answers = await answer_inputs(session, notice.id)
    answer, run = await engine.answer_question(
        notice_context(notice), document_set, request.question, bounded_history(request.history), answers
    )
    await record_call(session, Task.ANSWER_QUESTION, run, notice_id=notice.id)
    verified = verify_answer(answer, documents, answers)

    payload = checklist_payload(checklist) if checklist else None
    if not viewer.is_buyer and _tender_period_running(notice, payload, utcnow()):
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

    return AnswerView(
        answer=verified,
        engine=run.engine,
        usage=usage_view(run, prices),
        document_id=main.id,
        read=read_summary(document_set),
        question_deadline=question_deadline(notice, payload),
        formal_question_url=formal_question_url(notice, eavrop_url),
    )


def read_summary(document_set: DocumentSet) -> ReadSummary:
    outline = document_set.outline
    return ReadSummary(
        documents_read=sum(1 for item in outline if item.pages_included > 0),
        documents_total=len(outline),
        pages_read=sum(item.pages_included for item in outline),
        pages_total=sum(item.page_count for item in outline),
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


def _tender_period_running(notice: Notice, checklist: Checklist | None, now: datetime) -> bool:
    deadline = tender_deadline(notice, checklist)
    return deadline is None or deadline > now
