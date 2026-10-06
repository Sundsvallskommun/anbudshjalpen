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
from anbudsklar.services.matching import rematch_company

logger = logging.getLogger(__name__)

# A unit of work: commits on success and rolls back on error (`anbudsklar.db.session_scope`).
SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]
# Runs of one company's re-assessment in a row before the rest is left to match_all.
MAX_REMATCH_PASSES = 3


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


class MatchRefresher:
    """Re-assesses a company's matches after its profile was saved, one run per company at a time.

    With a language model every run calls the engine once per candidate (with Eneo, on the
    shared quota of the service key), so saving twice in a row must not start two runs. A save
    while a run is going asks for one more pass afterwards instead, which reads the latest
    profile; the outdated pass keeps nothing (`services.matching.rematch_company`). The state
    lives in the app process, like the sessions (decision 0007).
    """

    def __init__(self) -> None:
        self._running: set[uuid.UUID] = set()
        self._again: set[uuid.UUID] = set()

    async def run(self, session_factory: SessionFactory, engine: AiEngine, company_id: uuid.UUID) -> None:
        if company_id in self._running:
            self._again.add(company_id)
            return
        self._running.add(company_id)
        try:
            for _ in range(MAX_REMATCH_PASSES):
                self._again.discard(company_id)
                kept = await _rematch(session_factory, engine, company_id)
                if kept and company_id not in self._again:
                    return
            logger.info("The profile of company %s kept changing; match_all re-assesses it", company_id)
        finally:
            self._running.discard(company_id)
            self._again.discard(company_id)


async def _rematch(session_factory: SessionFactory, engine: AiEngine, company_id: uuid.UUID) -> bool:
    """One pass in a session of its own: True when it kept its result or failed (match_all retries)."""

    try:
        async with session_factory() as session:
            return await rematch_company(session, engine, company_id)
    except Exception:
        logger.exception("Matches of company %s could not be re-assessed; match_all will retry", company_id)
        return True
