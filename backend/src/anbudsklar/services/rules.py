"""General questions about procurement rules (regelhjalpen)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar import lou_refs
from anbudsklar.ai.engine import AiEngine, RuleContext
from anbudsklar.api.schemas import RulesView
from anbudsklar.models import LouSection
from anbudsklar.search.queries import search_lou

CONTEXT_SECTIONS = 5
# Engines with their own knowledge and our MCP tools do not need our search results.
ENGINES_WITH_OWN_KNOWLEDGE = frozenset({"eneo"})


def lou_reference(section: LouSection) -> str:
    return lou_refs.lou_reference(section.chapter, section.section)


def lou_url(section: LouSection) -> str:
    return lou_refs.lou_url(section.chapter, section.section)


def rule_context(section: LouSection) -> RuleContext:
    return RuleContext(
        reference=lou_reference(section),
        title=section.heading or section.chapter_title or lou_reference(section),
        text=section.text,
        url=lou_url(section),
    )


async def ask_rules(
    session: AsyncSession, engine: AiEngine, question: str, session_id: str | None
) -> RulesView:
    """Answer a rules question. `session_id` continues a conversation the caller may continue."""

    context: list[RuleContext] = []
    if engine.name not in ENGINES_WITH_OWN_KNOWLEDGE:
        sections = await search_lou(session, question, limit=CONTEXT_SECTIONS)
        context = [rule_context(section) for section in sections]
    answer, run = await engine.answer_rules(question, session_id, context)
    return RulesView(answer=answer, engine=run.engine)
