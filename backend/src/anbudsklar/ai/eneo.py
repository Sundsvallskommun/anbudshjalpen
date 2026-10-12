"""AI engine that runs each task as an Eneo assistant through Eneo's HTTP API.

This is the agreed PoC path (decision 0004). It follows "option S" from the Eneo
research: the runtime key is a service key, which may ask but cannot upload files, so
the document travels inside the question as text with our own [SIDA n] markers. That
also guarantees that the page numbers the model cites are the pages our citation
verification checks.

Every task run opens a fresh session and deletes it afterwards, also when the task
fails, so no company data stays in Eneo (the assistants' one-day retention is only the
safety net). Regelhjälpen is the exception: it is a conversation, so its session is
kept and returned for follow-up questions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from anbudsklar.ai.engine import EngineConfigError, EngineError, EngineRun, QuestionTurn, RuleContext
from anbudsklar.ai.jsonio import request_validated
from anbudsklar.ai.prompts import render_task_message
from anbudsklar.config import Settings
from anbudsklar.contracts import (
    Answer,
    Checklist,
    CompanyProfile,
    ContractModel,
    CpvCandidate,
    CpvSuggestions,
    DocumentSet,
    MatchAssessment,
    NoticeContext,
    PagedDocument,
    ReviewResult,
    RulesAnswer,
    RuleSource,
    Task,
)

logger = logging.getLogger(__name__)

_INREF = re.compile(r"\s*<inref\b[^>]*/>")
_MAX_RETRY_AFTER_SECONDS = 20.0
# Assistant ids come from our own provisioning file; Eneo issues UUIDs, but any plain token
# is a safe path segment. Session ids must be UUIDs (see `_session_segment`).
_SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
_LOGGED_MESSAGE_CHARS = 300

# Eneo error codes (eneo_error_code) the adapter maps to Swedish messages. 9007 is Eneo's
# generic BAD_REQUEST (for example a model that is not enabled in the space); only its
# attachment budget check uses it for "does not fit the context window".
_BAD_REQUEST = 9007
_PROVIDER_ERROR = 9010
_FILE_TOO_LARGE = 9015
_PROVIDER_REJECTED = 9041
_CONTEXT_WORDS = re.compile(r"context window|tokens", re.IGNORECASE)
_TOO_LARGE_MESSAGE = "Underlaget är för stort för språkmodellen i Eneo. Prova en modell med större kontext."


class SessionNotFoundError(EngineError):
    """A follow-up targeted a session that Eneo no longer has (deleted or expired)."""


def _session_segment(session_id: str) -> str | None:
    """The canonical UUID for a session id, or None when it is not one.

    Regelhjälpen's session id comes from an anonymous browser and ends up in the path of
    a call made with the space's admin key. Only a UUID may get there: anything else
    ("../publish/?published=true#") could steer that call at another Eneo endpoint.
    """

    try:
        return str(uuid.UUID(session_id))
    except (ValueError, AttributeError, TypeError):
        return None


def _assistant_segment(assistant_id: str) -> str:
    if not _SAFE_ID.fullmatch(assistant_id):
        raise EngineConfigError("Assistent-id:t för Eneo är ogiltigt. Kör `anbudsklar eneo provision` igen.")
    return assistant_id


@dataclass(frozen=True)
class AskResult:
    """The parts of Eneo's AskResponse that the engine uses."""

    session_id: str
    answer: str
    model: str | None = None
    references: list[dict[str, Any]] = field(default_factory=list)
    tool_references: list[dict[str, Any]] = field(default_factory=list)


def load_assistant_ids(path: Path) -> dict[Task, str]:
    """Read the {task: assistant_id} file written by `anbudsklar eneo provision`."""

    # The path and the OS error go to the log only: the message can reach an anonymous visitor.
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        logger.error("Eneo assistants file not found: %s", path)
        raise EngineConfigError(
            "Eneo-assistenterna är inte uppsatta. Kör `anbudsklar eneo provision` för att skapa dem."
        ) from error
    except (OSError, json.JSONDecodeError) as error:
        logger.error("Could not read the Eneo assistants file %s: %s", path, error)
        raise EngineConfigError("Filen med Eneo-assistenternas id gick inte att läsa.") from error
    if not isinstance(raw, dict):
        logger.error("The Eneo assistants file %s does not hold a JSON object", path)
        raise EngineConfigError(
            "Filen med Eneo-assistenternas id har fel format. Kör `anbudsklar eneo provision`."
        )
    known = {task.value: task for task in Task}
    return {known[key]: str(value) for key, value in raw.items() if key in known and value}


def clean_answer(text: str) -> str:
    """Remove Eneo's inline reference tags (<inref id="…"/>), which only its own UI renders."""

    return _INREF.sub("", text).strip()


def _tool_source(item: dict[str, Any]) -> tuple[str, str | None]:
    """Title and reference of an MCP tool reference, as our MCP server labels them.

    Our resources set `_meta.title` to the law reference ("LOU 20 kap. 1 §") with the
    paragraph heading in `section`, and for document pages `title` to the file name with
    the page in `pageRange`. `RuleSource.reference` is the short locator in both cases.
    """

    meta = item.get("meta") or {}
    title = str(meta.get("title") or "").strip()
    section = str(meta.get("section") or "").strip()
    page = str(meta.get("pageRange") or "").strip()
    fallback = str(item.get("mcp_tool_name") or item.get("uri") or "Upphandlingsdata")
    if page:
        return title or section or fallback, f"sida {page}"
    if title and section:
        return section, title
    return title or section or fallback, None


def rule_sources(references: list[dict[str, Any]], tool_references: list[dict[str, Any]]) -> list[RuleSource]:
    """Map Eneo knowledge references and MCP tool references to `RuleSource`s (deduplicated)."""

    sources: list[RuleSource] = []
    seen: set[tuple[str, str | None, str | None]] = set()

    def add(title: str, reference: str | None, url: str | None) -> None:
        key = (title, reference, url)
        if key not in seen:
            seen.add(key)
            sources.append(RuleSource(title=title, reference=reference, url=url))

    for item in references:
        metadata = item.get("metadata") or {}
        url = metadata.get("url") or None
        add(metadata.get("title") or url or "Kunskapskälla i Eneo", None, url)
    for item in tool_references:
        uri = item.get("uri") or None
        url = uri if uri and uri.startswith(("https://", "http://")) else None
        title, reference = _tool_source(item)
        add(title, reference, url)
    return sources


def _error_body(response: httpx.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _error_code(response: httpx.Response) -> int | None:
    code = _error_body(response).get("eneo_error_code")
    return code if isinstance(code, int) else None


def _error_message(response: httpx.Response) -> str:
    """Eneo's own explanation, for the log only (it can name models and limits)."""

    body = _error_body(response)
    detail = body.get("detail")
    message = body.get("message") or (detail.get("message") if isinstance(detail, dict) else detail)
    return str(message or "")[:_LOGGED_MESSAGE_CHARS]


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return float(response.headers.get("Retry-After", ""))
    except ValueError:
        return None


def _status_error(response: httpx.Response) -> EngineError:
    """A Swedish error for a failed ask, marked permanent when the same input cannot succeed."""

    status, code = response.status_code, _error_code(response)
    if status == 400 and code == _BAD_REQUEST:
        if _CONTEXT_WORDS.search(_error_message(response)):
            return EngineError(_TOO_LARGE_MESSAGE, retryable=False)
        return EngineConfigError(
            "Eneo avvisade förfrågan. Kontrollera assistentens inställningar i Eneo, till exempel att "
            "språkmodellen är aktiverad i spacet."
        )
    if status == 400 and code == _PROVIDER_REJECTED:
        return EngineError(
            "Språkmodellen i Eneo avvisade förfrågan, till exempel för att den var för stor eller bröt mot "
            "leverantörens regler.",
            retryable=False,
        )
    if status == 413 or code == _FILE_TOO_LARGE:
        return EngineError(_TOO_LARGE_MESSAGE, retryable=False)
    if status == 422:
        return EngineError(
            "Eneo kunde inte ta emot förfrågan, till exempel för att texten var för lång.", retryable=False
        )
    if status == 503 and code == _PROVIDER_ERROR:
        return EngineError("Språkmodellen i Eneo svarar inte just nu. Försök igen om en stund.")
    if status == 429:
        wait = _retry_after(response)
        later = f" om {max(1, round(wait / 60))} minuter" if wait else " senare"
        return EngineError(f"Eneo tar inte emot fler anrop från Anbudshjälpen just nu. Försök igen{later}.")
    if status in (401, 403):
        return EngineConfigError(
            "Eneo nekade åtkomst. Kontrollera ENEO_API_KEY, ENEO_API_KEY_HEADER_NAME och att nyckeln gäller "
            "Anbudshjälpens space."
        )
    if status == 404:
        return EngineConfigError("Assistenten finns inte i Eneo. Kör `anbudsklar eneo provision` igen.")
    return EngineError(f"Eneo svarade med fel {status}. Försök igen om en stund.")


def _model_name(body: dict[str, Any]) -> str | None:
    model = body.get("model")
    if isinstance(model, dict):
        return model.get("nickname") or model.get("name")
    return None


class EneoEngine:
    """`AiEngine` backed by one Eneo assistant per task (ids from `eneo_assistants_file`)."""

    name = "eneo"

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        if not (settings.eneo_backend_url and settings.eneo_api_key):
            raise EngineConfigError("ENEO_BACKEND_URL och ENEO_API_KEY måste vara satta.")
        self._base_url = settings.eneo_backend_url.rstrip("/")
        self._assistants_file = settings.eneo_assistants_file
        self._assistants: dict[Task, str] | None = None
        self._max_retries = settings.ai_max_retries
        self._timeout = settings.ai_timeout_seconds
        self._client = client or httpx.AsyncClient(
            base_url=self._base_url,
            headers={settings.eneo_api_key_header_name: settings.eneo_api_key.get_secret_value()},
            timeout=httpx.Timeout(settings.ai_timeout_seconds, connect=10.0),
        )

    def _assistant(self, task: Task) -> str:
        if self._assistants is None:
            self._assistants = load_assistant_ids(self._assistants_file)
        try:
            return _assistant_segment(self._assistants[task])
        except KeyError as error:
            raise EngineConfigError(
                f"Det finns ingen Eneo-assistent för uppgiften {task.value}. Kör `anbudsklar eneo provision`."
            ) from error

    async def _send(
        self, method: str, path: str, payload: dict[str, Any] | None, params: dict[str, str]
    ) -> httpx.Response:
        try:
            return await self._client.request(method, path, json=payload, params=params or None)
        except httpx.TimeoutException as error:
            raise EngineError(f"Eneo svarade inte inom {self._timeout:.0f} sekunder.") from error
        except httpx.HTTPError as error:
            logger.warning("Could not reach Eneo at %s: %s", self._base_url, type(error).__name__)
            raise EngineError("Det gick inte att nå Eneo. Försök igen om en stund.") from error

    async def _request(
        self, method: str, path: str, payload: dict[str, Any] | None = None, **params: str
    ) -> httpx.Response:
        """One API call that waits once when Eneo asks for a short pause (429 with Retry-After)."""

        response = await self._send(method, path, payload, params)
        wait = _retry_after(response) if response.status_code == 429 else None
        if wait is not None and wait <= _MAX_RETRY_AFTER_SECONDS:
            await asyncio.sleep(wait)
            response = await self._send(method, path, payload, params)
        return response

    async def _ask(self, assistant_id: str, question: str, session_id: str | None = None) -> AskResult:
        """Ask in a new session, or continue `session_id` (which must be a UUID)."""

        path = f"/api/v1/assistants/{_assistant_segment(assistant_id)}/sessions/"
        segment = _session_segment(session_id) if session_id else None
        if session_id:
            if segment is None:
                raise SessionNotFoundError("Samtalet finns inte i Eneo.")
            path += f"{segment}/"
        response = await self._request("POST", path, {"question": question, "stream": False}, version="2")
        if response.status_code == 404 and session_id:
            raise SessionNotFoundError("Samtalet finns inte längre i Eneo.")
        if response.is_error:
            logger.warning(
                "Eneo ask failed: status=%s code=%s message=%s",
                response.status_code,
                _error_code(response),
                _error_message(response),
            )
            raise _status_error(response)
        body = response.json()
        returned = _session_segment(str(body.get("session_id") or ""))
        if returned is None:
            logger.warning("Eneo returned no usable session id")
        return AskResult(
            session_id=returned or segment or "",
            answer=str(body.get("answer") or ""),
            model=_model_name(body),
            references=list(body.get("references") or []),
            tool_references=list(body.get("mcp_tool_references") or []),
        )

    async def _delete_session(self, assistant_id: str, session_id: str) -> None:
        """Best effort: a failed delete is logged, never raised (retention removes it later)."""

        segment = _session_segment(session_id)
        if segment is None:
            logger.warning("Not deleting an Eneo session whose id is not a UUID")
            return
        try:
            response = await self._request(
                "DELETE", f"/api/v1/assistants/{_assistant_segment(assistant_id)}/sessions/{segment}/"
            )
        except EngineError:
            logger.warning("Could not delete Eneo session %s", session_id)
            return
        if response.is_error:
            logger.warning("Could not delete Eneo session %s: status=%s", session_id, response.status_code)

    async def _run_task[M: ContractModel](
        self, task: Task, model: type[M], **inputs: Any
    ) -> tuple[M, EngineRun]:
        assistant_id = self._assistant(task)
        session_id: str | None = None
        model_name: str | None = None

        async def send(message: str) -> str:
            nonlocal session_id, model_name
            result = await self._ask(assistant_id, message, session_id)
            session_id = result.session_id or session_id
            model_name = result.model or model_name
            return clean_answer(result.answer)

        try:
            value, attempts = await request_validated(
                model, render_task_message(task, **inputs), send, self._max_retries
            )
        finally:
            if session_id:
                await self._delete_session(assistant_id, session_id)
        return value, EngineRun(engine=self.name, model=model_name, attempts=attempts)

    async def interpret_document(
        self, notice: NoticeContext, document: PagedDocument
    ) -> tuple[Checklist, EngineRun]:
        return await self._run_task(Task.INTERPRET_DOCUMENT, Checklist, notice=notice, document=document)

    async def assess_match(
        self, profile: CompanyProfile, notice: NoticeContext, checklist: Checklist | None
    ) -> tuple[MatchAssessment, EngineRun]:
        return await self._run_task(
            Task.ASSESS_MATCH, MatchAssessment, profile=profile, notice=notice, checklist=checklist
        )

    async def review_draft(
        self, checklist: Checklist, draft: PagedDocument
    ) -> tuple[ReviewResult, EngineRun]:
        return await self._run_task(Task.REVIEW_DRAFT, ReviewResult, checklist=checklist, draft=draft)

    async def answer_question(
        self,
        notice: NoticeContext,
        documents: DocumentSet,
        question: str,
        history: list[QuestionTurn],
    ) -> tuple[Answer, EngineRun]:
        return await self._run_task(
            Task.ANSWER_QUESTION,
            Answer,
            notice=notice,
            documents=documents,
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
        """Ask Regelhjälpen; `context` is ignored because the assistant has its own sources.

        The session is kept so the conversation can continue. If it has expired, or the
        id is not a UUID, a new one is started transparently.
        """

        assistant_id = self._assistant(Task.ANSWER_RULES)
        message = render_task_message(Task.ANSWER_RULES, context=[], question=question)
        try:
            result = await self._ask(assistant_id, message, session_id)
        except SessionNotFoundError:
            # Expired, deleted or not a session id at all: start a new conversation.
            result = await self._ask(assistant_id, message, None)
        text = clean_answer(result.answer)
        if not text:
            raise EngineError("Regelhjälpen i Eneo gav ett tomt svar.")
        answer = RulesAnswer(
            answer=text,
            sources=rule_sources(result.references, result.tool_references),
            session_id=result.session_id or None,
        )
        return answer, EngineRun(engine=self.name, model=result.model)

    async def aclose(self) -> None:
        await self._client.aclose()
