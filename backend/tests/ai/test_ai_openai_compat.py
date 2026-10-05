"""OpenAI-compatible engine against a mocked chat completions endpoint.

The openai SDK (3.x) sends requests with `httpx2`, which respx does not patch, so the
tests give the client an `httpx2.MockTransport` that records requests and replays
responses.
"""

from __future__ import annotations

import json
from typing import Any

import httpx2
import pytest
from openai import AsyncOpenAI

from anbudsklar.ai.engine import EngineConfigError, EngineError, RuleContext
from anbudsklar.ai.openai_compat import OpenAICompatEngine, cited_sources
from anbudsklar.ai.prompts import load_prompt
from anbudsklar.config import Settings
from anbudsklar.contracts import NoticeContext, PagedDocument, Task

BASE_URL = "https://llm.test/v1"
NOTICE = NoticeContext(notice_id="n1", title="Ommålning (fiktiv)")
DOCUMENT = PagedDocument(filename="u.pdf", pages=["Leverantören ska ha F-skatt."])
ANSWER = {"answer": "Ja, F-skatt krävs.", "found_in_document": True, "suggest_formal_question": False}


class FakeEndpoint:
    """Replays responses in order and records the JSON body of every request."""

    def __init__(self, *responses: httpx2.Response) -> None:
        self._responses = list(responses)
        self.bodies: list[dict[str, Any]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        assert request.url.path == "/v1/chat/completions"
        self.bodies.append(json.loads(request.content))
        return self._responses.pop(0)


def _engine(endpoint: FakeEndpoint) -> OpenAICompatEngine:
    settings = Settings(
        _env_file=None,
        ai_engine="heuristic",
        openai_base_url=BASE_URL,
        openai_api_key="test-key",
        openai_model="test-model",
        ai_max_retries=1,
    )
    http_client = httpx2.AsyncClient(transport=httpx2.MockTransport(endpoint))
    client = AsyncOpenAI(base_url=BASE_URL, api_key="test-key", max_retries=0, http_client=http_client)
    return OpenAICompatEngine(settings, client=client)


def _completion(content: str) -> httpx2.Response:
    return httpx2.Response(
        200,
        json={
            "id": "c1",
            "object": "chat.completion",
            "created": 0,
            "model": "test-model",
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}
            ],
        },
    )


async def test_asks_with_json_schema_and_the_prompt_file() -> None:
    endpoint = FakeEndpoint(_completion(json.dumps(ANSWER)))
    answer, run = await _engine(endpoint).answer_question(NOTICE, DOCUMENT, "Krävs F-skatt?", [])
    body = endpoint.bodies[0]
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["name"] == "besvara_fraga"
    assert body["messages"][0] == {"role": "system", "content": load_prompt(Task.ANSWER_QUESTION)}
    assert "[SIDA 1]" in body["messages"][1]["content"]
    assert answer.found_in_document is True
    assert (run.engine, run.model, run.attempts) == ("openai", "test-model", 1)


async def test_steps_down_to_json_object_and_remembers_it() -> None:
    endpoint = FakeEndpoint(
        httpx2.Response(400, json={"error": {"message": "response_format json_schema not supported"}}),
        _completion(json.dumps(ANSWER)),
        _completion(json.dumps(ANSWER)),
    )
    engine = _engine(endpoint)
    await engine.answer_question(NOTICE, DOCUMENT, "Krävs F-skatt?", [])
    await engine.answer_question(NOTICE, DOCUMENT, "Krävs F-skatt?", [])
    formats = [body["response_format"]["type"] for body in endpoint.bodies]
    assert formats == ["json_schema", "json_object", "json_object"]


async def test_retries_invalid_json_in_the_same_conversation() -> None:
    endpoint = FakeEndpoint(_completion("Svaret är ja."), _completion(f"```json\n{json.dumps(ANSWER)}\n```"))
    _, run = await _engine(endpoint).answer_question(NOTICE, DOCUMENT, "Krävs F-skatt?", [])
    assert run.attempts == 2
    retry = endpoint.bodies[1]["messages"]
    assert [message["role"] for message in retry] == ["system", "user", "assistant", "user"]
    assert retry[2]["content"] == "Svaret är ja."
    assert retry[3]["content"].startswith("Ditt förra svar kunde inte användas")


async def test_maps_authentication_errors_to_swedish() -> None:
    endpoint = FakeEndpoint(httpx2.Response(401, json={"error": {"message": "no"}}))
    with pytest.raises(EngineConfigError, match="OPENAI_API_KEY"):
        await _engine(endpoint).interpret_document(NOTICE, DOCUMENT)


async def test_a_request_rejected_in_every_format_is_permanent() -> None:
    rejected = {"error": {"message": "maximum context length exceeded"}}
    endpoint = FakeEndpoint(*(httpx2.Response(400, json=rejected) for _ in range(3)))
    with pytest.raises(EngineError, match="avvisade förfrågan") as raised:
        await _engine(endpoint).interpret_document(NOTICE, DOCUMENT)
    assert raised.value.retryable is False
    assert len(endpoint.bodies) == 3  # json_schema, json_object, plain


async def test_server_errors_stay_retryable() -> None:
    endpoint = FakeEndpoint(httpx2.Response(500, json={"error": {"message": "boom"}}))
    with pytest.raises(EngineError, match="fel 500") as raised:
        await _engine(endpoint).interpret_document(NOTICE, DOCUMENT)
    assert raised.value.retryable is True


async def test_rules_answer_is_plain_text_with_cited_sources() -> None:
    context = [
        RuleContext(
            reference="LOU 4 kap. 1 §", title="Principer", text="…", url="https://example.test/lou#4-1"
        ),
        RuleContext(reference="LOU 19 kap. 7 §", title="Annonsering under tröskelvärdena", text="…"),
    ]
    endpoint = FakeEndpoint(_completion("Alla leverantörer ska behandlas lika (4 kap. 1 § LOU)."))
    answer, _ = await _engine(endpoint).answer_rules("Vad betyder likabehandling?", None, context)
    assert "response_format" not in endpoint.bodies[0]
    assert [source.reference for source in answer.sources] == ["LOU 4 kap. 1 §"]
    assert answer.session_id is None


def test_cited_sources_match_literal_references() -> None:
    context = [RuleContext(reference="Upphandlingsmyndigheten: Lämna anbud", title="Lämna anbud", text="…")]
    assert cited_sources("Se (Upphandlingsmyndigheten: Lämna anbud).", context)[0].title == "Lämna anbud"
    assert cited_sources("Inget citerat.", context) == []


def test_requires_configuration() -> None:
    settings = Settings(_env_file=None, ai_engine="heuristic")
    with pytest.raises(EngineError, match="OPENAI_BASE_URL"):
        OpenAICompatEngine(settings)
