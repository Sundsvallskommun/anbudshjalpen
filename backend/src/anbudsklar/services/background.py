"""Work that runs after a request has been answered, in its own database session."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.ai.engine import AiEngine, EngineError
from anbudsklar.services.checklists import interpret_document, record_interpret_failure
from anbudsklar.services.dates import utcnow
from anbudsklar.services.errors import InvalidInputError

logger = logging.getLogger(__name__)

# A unit of work: commits on success and rolls back on error (`anbudsklar.db.session_scope`).
SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


async def interpret_in_background(
    session_factory: SessionFactory, engine: AiEngine, document_id: uuid.UUID
) -> None:
    """Interpret a document right away instead of waiting for the worker.

    A failure is recorded on the document in a session of its own (the first one rolls
    back), so that the worker's interpret_pending job retries it with the same back-off
    as its own failures and the buyer sees it among the interpretations.
    """

    try:
        async with session_factory() as session:
            await interpret_document(session, engine, document_id)
    except (EngineError, InvalidInputError) as error:
        logger.warning("Interpretation of document %s failed; interpret_pending will retry", document_id)
        try:
            async with session_factory() as session:
                await record_interpret_failure(session, document_id, error, utcnow())
        except Exception:
            logger.exception("Could not record the failed interpretation of document %s", document_id)
    except Exception:
        logger.exception("Interpretation of document %s failed; interpret_pending will retry", document_id)
