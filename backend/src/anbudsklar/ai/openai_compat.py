"""AI engine for any OpenAI-compatible chat completions endpoint.

The fallback when no Eneo instance is at hand (decision 0004): the prompt file is the
system prompt and the rendered task inputs are the user message, exactly as in Eneo.
Structured output support differs between providers, so the engine asks for a JSON
schema first, falls back to plain JSON mode and finally to prompt-only JSON, and
remembers the first mode that worked.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from typing import Any, Literal

import openai
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion, ChatCompletionMessageParam
from openai.types.chat.completion_create_params import ResponseFormat

from anbudsklar.ai.engine import (
    EngineConfigError,
    EngineError,
    EngineRun,
    QuestionTurn,
    RuleContext,
    TokenUsage,
)
from anbudsklar.ai.jsonio import request_validated
from anbudsklar.ai.prompts import TEXT_TASKS, load_prompt, render_task_message
from anbudsklar.config import Settings
from anbudsklar.contracts import (
    TASK_OUTPUTS,
    Answer,
    Checklist,
    CompanyProfile,
    ContractModel,
    CpvCandidate,
    CpvSuggestions,
    DocumentSet,
    MatchAssessment,
    NoticeContext,
    PublishedAnswerInput,
    ReviewResult,
    RulesAnswer,
    RuleSource,
    Task,
    model_output_schema,
)
from anbudsklar.policy_refs import parse_policy_reference

logger = logging.getLogger(__name__)

FormatMode = Literal["json_schema", "json_object", "plain"]
_MODES: tuple[FormatMode, ...] = ("json_schema", "json_object", "plain")
_CUT_OFF_MESSAGE = (
    "Språkmodellens svar blev för långt och höggs av innan det var klart. Dela upp underlaget, eller välj "
    "en modell som kan skriva längre svar."
)
_LAW_REFERENCE = re.compile(r"(\d+)\s*kap\.\s*(\d+\s*[a-z]?)\s*§", re.IGNORECASE)


def _law_keys(text: str) -> set[tuple[str, str]]:
    return {(chapter, section.replace(" ", "").lower()) for chapter, section in _LAW_REFERENCE.findall(text)}


def _cites_policy(answer: str, reference: str) -> bool:
    """True when the answer names a steering-document section in any of the usual forms.

    "Inköpsstrategin 5.2", "inköpsstrategin, avsnitt 5.2" and "inköpsstrategins avsnitt 5.2"
    all count; "5.21" does not count for 5.2.
    """

    parsed = parse_policy_reference(reference)
    if parsed is None:
        return False
    name, number = parsed
    if name is None:
        return False
    pattern = rf"{re.escape(name)}s?\W{{0,20}}?(?:avsnitt\s*)?{re.escape(number)}(?!\.?\d)"
    return re.search(pattern, answer, re.IGNORECASE) is not None


def cited_sources(answer: str, context: list[RuleContext]) -> list[RuleSource]:
    """The rule texts an answer refers to: "N kap. M §" for the law, the document's name and
    section number for a steering document, or the literal reference."""

    cited_keys = _law_keys(answer)
    sources: list[RuleSource] = []
    for item in context:
        keys = _law_keys(item.reference)
        cited = (keys and keys <= cited_keys) or item.reference in answer
        if cited or _cites_policy(answer, item.reference):
            sources.append(RuleSource(title=item.title, reference=item.reference, url=item.url))
    return sources


def _usage(completion: ChatCompletion) -> TokenUsage | None:
    """The provider's own count for one completion; None when the endpoint sends none.

    OpenAI, Azure and vLLM fill `usage` on every completion, but a proxy or a small
    local server may leave it out, and the statistics then say so instead of guessing.
    """

    usage = completion.usage
    if usage is None:
        return None
    return TokenUsage(input_tokens=usage.prompt_tokens, output_tokens=usage.completion_tokens)


def _engine_error(error: openai.OpenAIError) -> EngineError:
    """A Swedish error, marked permanent when the provider refuses this very request."""

    if isinstance(error, openai.APITimeoutError):
        return EngineError("Språkmodellen svarade inte i tid. Försök igen om en stund.")
    if isinstance(error, openai.APIConnectionError):
        # What to check goes to the log only: the message can reach an anonymous visitor.
        logger.warning("Could not reach the model at OPENAI_BASE_URL: %s", type(error).__name__)
        return EngineError("Det gick inte att nå språkmodellen. Försök igen om en stund.")
    if isinstance(error, openai.AuthenticationError | openai.PermissionDeniedError):
        return EngineConfigError("Språkmodellen nekade åtkomst. Kontrollera OPENAI_API_KEY.")
    if isinstance(error, openai.RateLimitError):
        return EngineError("Språkmodellen tar inte emot fler anrop just nu. Försök igen om en stund.")
    if isinstance(error, openai.BadRequestError | openai.UnprocessableEntityError):
        return EngineError(
            "Språkmodellen avvisade förfrågan, till exempel för att underlaget är för stort för modellen.",
            retryable=False,
        )
    if isinstance(error, openai.APIStatusError) and error.status_code == 413:
        return EngineError("Underlaget är för stort för språkmodellen.", retryable=False)
    if isinstance(error, openai.APIStatusError):
        return EngineError(f"Språkmodellen svarade med fel {error.status_code}. Försök igen om en stund.")
    return EngineError("Anropet till språkmodellen misslyckades.")


class OpenAICompatEngine:
    """`AiEngine` over the OpenAI chat completions API (OpenAI, Azure, vLLM, Ollama, LiteLLM …)."""

    name = "openai"

    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None) -> None:
        if not (settings.openai_base_url and settings.openai_api_key and settings.openai_model):
            raise EngineConfigError("OPENAI_BASE_URL, OPENAI_API_KEY och OPENAI_MODEL måste vara satta.")
        self._model = settings.openai_model
        self._max_retries = settings.ai_max_retries
        self._mode: FormatMode = "json_schema"
        self._client = client or AsyncOpenAI(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key.get_secret_value(),
            timeout=settings.ai_timeout_seconds,
            max_retries=1,
        )

    @staticmethod
    def _response_format(mode: FormatMode, task: Task) -> ResponseFormat | None:
        if mode == "json_schema":
            schema = model_output_schema(TASK_OUTPUTS[task])
            return {
                "type": "json_schema",
                "json_schema": {"name": task.value, "schema": schema, "strict": False},
            }
        if mode == "json_object":
            return {"type": "json_object"}
        return None

    async def _create(
        self, messages: list[ChatCompletionMessageParam], response_format: ResponseFormat | None
    ) -> ChatCompletion:
        if response_format is None:
            return await self._client.chat.completions.create(model=self._model, messages=messages)
        return await self._client.chat.completions.create(
            model=self._model, messages=messages, response_format=response_format
        )

    async def _complete(
        self, task: Task, messages: list[ChatCompletionMessageParam]
    ) -> tuple[str, TokenUsage | None]:
        """One completion and its token count, stepping down the structured-output modes on 400 responses.

        A mode is remembered only after it worked, so one oversized request does not
        permanently turn off structured output.
        """

        modes: tuple[FormatMode, ...] = (
            ("plain",) if task in TEXT_TASKS else _MODES[_MODES.index(self._mode) :]
        )
        for mode in modes:
            try:
                completion = await self._create(messages, self._response_format(mode, task))
            except openai.BadRequestError as error:
                if mode == modes[-1]:
                    raise _engine_error(error) from error
                continue
            except openai.OpenAIError as error:
                raise _engine_error(error) from error
            if task not in TEXT_TASKS:
                self._mode = mode
            choice = completion.choices[0] if completion.choices else None
            if choice is not None and choice.finish_reason == "length":
                # The JSON is cut off. Asking for a corrected answer would be cut off again, so
                # the caller is told at once instead of after the retries.
                raise EngineError(_CUT_OFF_MESSAGE, retryable=False)
            text = (choice.message.content or "") if choice is not None else ""
            return text, _usage(completion)
        raise EngineError("Anropet till språkmodellen misslyckades.")

    async def _run_task[M: ContractModel](
        self, task: Task, model: type[M], **inputs: Any
    ) -> tuple[M, EngineRun]:
        messages: list[ChatCompletionMessageParam] = [{"role": "system", "content": load_prompt(task)}]
        # Every attempt resends the conversation, so a retry costs the whole document again:
        # the run's usage is the sum, which is what the provider bills.
        used = TokenUsage(0, 0)
        counted = True

        async def send(message: str) -> str:
            nonlocal used, counted
            messages.append({"role": "user", "content": message})
            text, usage = await self._complete(task, messages)
            messages.append({"role": "assistant", "content": text})
            if usage is None:
                counted = False
            else:
                used = used + usage
            return text

        result, attempts = await request_validated(
            model, render_task_message(task, **inputs), send, self._max_retries
        )
        run = EngineRun(
            engine=self.name,
            model=self._model,
            attempts=attempts,
            notes=[f"svarsformat: {self._mode}"],
            usage=used if counted else None,
        )
        return result, run

    async def interpret_document(
        self,
        notice: NoticeContext,
        documents: DocumentSet,
        answers: Sequence[PublishedAnswerInput] = (),
    ) -> tuple[Checklist, EngineRun]:
        return await self._run_task(
            Task.INTERPRET_DOCUMENT, Checklist, notice=notice, documents=documents, answers=list(answers)
        )

    async def assess_match(
        self, profile: CompanyProfile, notice: NoticeContext, checklist: Checklist | None
    ) -> tuple[MatchAssessment, EngineRun]:
        return await self._run_task(
            Task.ASSESS_MATCH, MatchAssessment, profile=profile, notice=notice, checklist=checklist
        )

    async def review_draft(self, checklist: Checklist, draft: DocumentSet) -> tuple[ReviewResult, EngineRun]:
        return await self._run_task(Task.REVIEW_DRAFT, ReviewResult, checklist=checklist, draft=draft)

    async def answer_question(
        self,
        notice: NoticeContext,
        documents: DocumentSet,
        question: str,
        history: list[QuestionTurn],
        answers: Sequence[PublishedAnswerInput] = (),
    ) -> tuple[Answer, EngineRun]:
        return await self._run_task(
            Task.ANSWER_QUESTION,
            Answer,
            notice=notice,
            documents=documents,
            answers=list(answers),
            history=history,
            question=question,
        )

    async def suggest_cpv(
        self, description: str, candidates: list[CpvCandidate]
    ) -> tuple[CpvSuggestions, EngineRun]:
        return await self._run_task(
            Task.SUGGEST_CPV, CpvSuggestions, description=description, candidates=candidates
        )

    async def answer_rules(
        self, question: str, session_id: str | None, context: list[RuleContext]
    ) -> tuple[RulesAnswer, EngineRun]:
        """Free-text answer grounded in `context`; this engine keeps no conversation state."""

        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": load_prompt(Task.ANSWER_RULES)},
            {
                "role": "user",
                "content": render_task_message(Task.ANSWER_RULES, context=context, question=question),
            },
        ]
        text, usage = await self._complete(Task.ANSWER_RULES, messages)
        text = text.strip()
        if not text:
            raise EngineError("Språkmodellen gav ett tomt svar.")
        answer = RulesAnswer(answer=text, sources=cited_sources(text, context))
        return answer, EngineRun(engine=self.name, model=self._model, usage=usage)

    async def aclose(self) -> None:
        await self._client.close()
