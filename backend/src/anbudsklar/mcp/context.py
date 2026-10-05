"""What every MCP tool needs: settings, database sessions and source links."""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass

from mcp.server.fastmcp.exceptions import ToolError
from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar.config import Settings
from anbudsklar.mcp.guidance import ToolGuidance

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]

_TECHNICAL_ERROR = (
    "Tekniskt fel i Anbudsklar, försök igen om en stund. Om felet kvarstår: svara utan verktyget, "
    "säg att uppgiften inte kunde hämtas och hänvisa till annonsen i e-Avrop."
)


@dataclass(frozen=True)
class ToolContext:
    settings: Settings
    sessions: SessionFactory

    @property
    def budget(self) -> int:
        return self.settings.mcp_max_output_chars

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """A read session in which unexpected failures become a safe Swedish ToolError.

        mcp 1.x copies the full exception text into the tool result, which could show SQL
        or internals to the model. Tools do all their work inside this block. A ToolError,
        and so a `ToolGuidance` for a mistake the model can fix, passes through unchanged.
        """

        try:
            async with self.sessions() as session:
                yield session
        except ToolError:
            raise
        except Exception as exc:
            logger.exception("MCP tool failed")
            raise ToolError(_TECHNICAL_ERROR) from exc

    def document_page_url(self, document_id: uuid.UUID, page: int) -> str:
        """Link to the document file opened at the page (PDF viewers honour #page=)."""

        base = self.settings.public_url.rstrip("/")
        return f"{base}/api/documents/{document_id}/file#page={page}"


def parse_id(value: str, *, field: str, where: str) -> uuid.UUID:
    """Parse an id argument, with a Swedish next step when the model got it wrong."""

    try:
        return uuid.UUID(value.strip())
    except ValueError:
        message = f"'{value}' är inte ett giltigt {field}. Hämta rätt {field} med {where}."
        raise ToolGuidance(message) from None
