"""General questions about procurement rules (regelhjalpen).

Two source classes answer them (decision 0022): the law (LOU), which binds the supplier,
and the municipality's steering documents, which bind its own purchasers. Our own search
ranks both for the engines without knowledge of their own, and every source an engine
names is completed from our own copies: its kind, the excerpt and, for a steering
document, the note that says what it is.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from anbudsklar import lou_refs
from anbudsklar.ai.engine import AiEngine, RuleContext
from anbudsklar.api.schemas import RulesView
from anbudsklar.contracts import RuleSource, Task
from anbudsklar.models import LouSection, PolicySection
from anbudsklar.policy_refs import parse_policy_reference, policy_note, policy_reference, policy_url
from anbudsklar.search.queries import (
    get_lou_section,
    get_policy_section,
    parse_lou_reference,
    search_rule_texts,
)
from anbudsklar.services.ai_usage import TokenPrices, record_call, usage_view

CONTEXT_SECTIONS = 5
# Engines with their own knowledge and our MCP tools do not need our search results.
ENGINES_WITH_OWN_KNOWLEDGE = frozenset({"eneo"})


def lou_reference(section: LouSection) -> str:
    return lou_refs.lou_reference(section.chapter, section.section)


def lou_url(section: LouSection) -> str:
    return lou_refs.lou_url(section.chapter, section.section)


def rule_context(section: LouSection | PolicySection) -> RuleContext:
    """A found section as the engines read it: reference, title, text and link."""

    if isinstance(section, PolicySection):
        document = section.document
        return RuleContext(
            reference=policy_reference(document.short_title, section.number),
            title=section.heading,
            text=section.text,
            url=policy_url(document.source_url, section.page_start),
        )
    return RuleContext(
        reference=lou_reference(section),
        title=section.heading or section.chapter_title or lou_reference(section),
        text=section.text,
        url=lou_url(section),
    )


async def ask_rules(
    session: AsyncSession,
    engine: AiEngine,
    question: str,
    session_id: str | None,
    *,
    prices: TokenPrices | None = None,
) -> RulesView:
    """Answer a rules question. `session_id` continues a conversation the caller may continue.

    The question is never stored; the call is recorded for the statistics on Drift.
    """

    context: list[RuleContext] = []
    if engine.name not in ENGINES_WITH_OWN_KNOWLEDGE:
        sections = await search_rule_texts(session, question, limit=CONTEXT_SECTIONS)
        context = [rule_context(section) for section in sections]
    answer, run = await engine.answer_rules(question, session_id, context)
    await record_call(session, Task.ANSWER_RULES, run)
    sources = [await complete_source(session, source) for source in answer.sources]
    return RulesView(
        answer=answer.model_copy(update={"sources": sources}),
        engine=run.engine,
        usage=usage_view(run, prices),
    )


async def complete_source(session: AsyncSession, source: RuleSource) -> RuleSource:
    """A source with what our own copies know about it: kind, excerpt, link and note.

    The page shows each source as a card with the source's own words, whichever engine
    named it, and the excerpt never comes from a model. Guidance, web pages and sections
    we do not hold are left as they are, apart from the kind a LOU reference reveals.
    """

    reference = source.reference or ""
    if reference.startswith("LOU"):
        parsed = parse_lou_reference(reference)
        section = await get_lou_section(session, *parsed) if parsed else None
        excerpt = source.excerpt or (lou_refs.lou_excerpt(section.text) if section else None)
        return source.model_copy(update={"kind": "law", "excerpt": excerpt})
    parsed = parse_policy_reference(reference)
    section = await get_policy_section(session, parsed[1], parsed[0]) if parsed else None
    if section is None:
        return source
    document = section.document
    return source.model_copy(
        update={
            "kind": "policy",
            "excerpt": source.excerpt or lou_refs.lou_excerpt(section.text),
            "url": source.url or policy_url(document.source_url, section.page_start),
            "note": source.note or policy_note(document.decided_by, document.decided_on),
        }
    )
