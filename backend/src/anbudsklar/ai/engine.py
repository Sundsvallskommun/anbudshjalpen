"""The AI engine interface.

Everything in the app talks to `AiEngine`, never to a model or to Eneo directly. The
PoC ships three implementations:

- `eneo`: Eneo assistants via Eneo's HTTP API (the agreed PoC path, decision 0004).
- `openai`: any OpenAI-compatible endpoint (fallback when no Eneo instance is at hand).
- `heuristic`: an offline, deterministic baseline without a language model. It keeps
  the app and the tests runnable anywhere and gives the quality test a baseline.

In production the `eneo` implementation moves each task into an Eneo Flow with the
same output contract (see `anbudsklar.contracts`).

Rules for implementations:
- Return validated contract models. Retry invalid JSON up to `settings.ai_max_retries`
  times, telling the model what was wrong, then raise `EngineOutputError`.
- Never verify citations here; `anbudsklar.documents.citations` does that afterwards.
- Do not persist company data. Delete remote sessions and uploaded files when done.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from anbudsklar.contracts import (
    Answer,
    Checklist,
    CompanyProfile,
    CpvCandidate,
    CpvSuggestions,
    DocumentSet,
    MatchAssessment,
    NoticeContext,
    PagedDocument,
    PublishedAnswerInput,
    ReviewResult,
    RulesAnswer,
)


class EngineError(RuntimeError):
    """The engine could not complete a task (transport, configuration, quota).

    The message is Swedish and free of addresses, paths and secrets, because the API can
    show it to an anonymous visitor. `retryable=False` says that the same input will fail
    the same way again (a document too large for the model, a request the provider
    rejects), so the worker gives up on it at once instead of backing off.
    """

    def __init__(self, message: str = "", *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class EngineConfigError(EngineError):
    """The engine is not set up correctly; an operator has to act.

    The message names what to check (a setting, the provisioning command), which helps
    the buyer and the log but means nothing to a visitor: the API shows visitors a
    general message instead.
    """


class EngineOutputError(EngineError):
    """The model kept returning output that does not satisfy the task contract."""


@dataclass(frozen=True)
class QuestionTurn:
    """An earlier question and answer in the same conversation about a document."""

    question: str
    answer: str


@dataclass(frozen=True)
class TokenUsage:
    """Tokens one task run consumed, as the model provider counted them, summed over its attempts.

    The counts feed the usage and cost statistics on Drift (`services.ai_usage`), never a
    decision in the app, so an engine that cannot count leaves `EngineRun.usage` as None
    rather than guessing.
    """

    input_tokens: int
    output_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    def __add__(self, other: TokenUsage) -> TokenUsage:
        return TokenUsage(self.input_tokens + other.input_tokens, self.output_tokens + other.output_tokens)


@dataclass(frozen=True)
class EngineRun:
    """Metadata about how a result was produced, stored next to the result."""

    engine: str
    model: str | None = None
    attempts: int = 1
    notes: list[str] = field(default_factory=list)
    # None when the engine reported no counts: the heuristic engine has no model, and the
    # Eneo adapter does not read Eneo's counts yet (see `anbudsklar.ai.eneo`).
    usage: TokenUsage | None = None


@dataclass(frozen=True)
class RuleContext:
    """A rule text found by our own search, given to engines without their own knowledge."""

    reference: str  # e.g. "LOU 20 kap. 1 §"
    title: str
    text: str
    url: str | None = None


@runtime_checkable
class AiEngine(Protocol):
    """One method per AI task. See `anbudsklar.contracts.tasks.Task`."""

    name: str

    async def interpret_document(
        self,
        notice: NoticeContext,
        documents: DocumentSet,
        answers: Sequence[PublishedAnswerInput] = (),
    ) -> tuple[Checklist, EngineRun]:
        """tolka_underlag: turn a procurement's documents into a checklist with citations.

        `documents` holds every document of the procurement, the main one first, as the
        bundle chose them (decision 0020): requirements in attachments are as binding as
        those in the main document. `answers` are the buyer's published answers (decision
        0018): they settle open questions and can change a requirement, so the checklist
        reflects them.
        """
        ...

    async def assess_match(
        self, profile: CompanyProfile, notice: NoticeContext, checklist: Checklist | None
    ) -> tuple[MatchAssessment, EngineRun]:
        """bedom_matchning: honest fit assessment of a notice for a company."""
        ...

    async def review_draft(
        self, checklist: Checklist, draft: PagedDocument
    ) -> tuple[ReviewResult, EngineRun]:
        """granska_utkast: check a tender draft against the checklist. The draft is not stored."""
        ...

    async def answer_question(
        self,
        notice: NoticeContext,
        documents: DocumentSet,
        question: str,
        history: list[QuestionTurn],
        answers: Sequence[PublishedAnswerInput] = (),
    ) -> tuple[Answer, EngineRun]:
        """besvara_fraga: answer a question grounded in the procurement's documents and the
        buyer's published answers, which go before the documents where they differ (decision 0018)."""
        ...

    async def suggest_cpv(
        self, description: str, candidates: list[CpvCandidate]
    ) -> tuple[CpvSuggestions, EngineRun]:
        """foresla_cpv: pick CPV codes for a company description from search candidates."""
        ...

    async def answer_rules(
        self, question: str, session_id: str | None, context: list[RuleContext]
    ) -> tuple[RulesAnswer, EngineRun]:
        """regelhjalpen: general questions about procurement rules (LOU, guidance, local rules).

        `context` holds LOU sections found by our own search. The Eneo engine ignores it,
        because its assistant has knowledge sources and our MCP tools of its own.
        """
        ...

    async def aclose(self) -> None:
        """Release network resources."""
        ...


def build_engine(name: str | None = None) -> AiEngine:
    """Create the configured engine (`settings.ai_engine` unless `name` is given)."""

    from anbudsklar.config import get_settings

    settings = get_settings()
    selected = name or settings.ai_engine
    if selected == "heuristic":
        from anbudsklar.ai.heuristic import HeuristicEngine

        return HeuristicEngine()
    if selected == "openai":
        from anbudsklar.ai.openai_compat import OpenAICompatEngine

        return OpenAICompatEngine(settings)
    if selected == "eneo":
        from anbudsklar.ai.eneo import EneoEngine

        return EneoEngine(settings)
    raise EngineConfigError(f"Okänd AI-motor: {selected}. Välj eneo, openai eller heuristic i AI_ENGINE.")
