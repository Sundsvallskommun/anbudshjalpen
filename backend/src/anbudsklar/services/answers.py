"""The buyer's published answers as input to the AI tasks (decision 0018).

Inköp's answers in e-Avrop reach every supplier and belong to the procurement documents,
so the tasks that read the documents read them too: Fråga AI quotes them, and the
checklist is interpreted again when they change.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.contracts import PublishedAnswerInput
from anbudsklar.search.queries import list_published_answers


async def answer_inputs(session: AsyncSession, notice_id: uuid.UUID) -> list[PublishedAnswerInput]:
    """The notice's answers, oldest first and numbered as the web app numbers them."""

    rows = await list_published_answers(session, notice_id)
    return [
        PublishedAnswerInput(
            number=number,
            key=row.external_key,
            question=row.question,
            answer=row.answer,
            answered_at=row.answered_at,
        )
        for number, row in enumerate(rows, start=1)
    ]


def answers_digest(answers: Sequence[PublishedAnswerInput]) -> str | None:
    """A fingerprint of what the answers say, so that a changed, added or withdrawn answer shows.

    None without answers, which is also what every checklist made before decision 0018 has,
    so a notice without answers is never interpreted again for their sake.
    """

    if not answers:
        return None
    content = [[answer.key, answer.question, answer.answer] for answer in answers]
    return hashlib.sha256(json.dumps(content, ensure_ascii=False).encode()).hexdigest()
