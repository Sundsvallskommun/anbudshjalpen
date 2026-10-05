"""Extracting, validating and retrying model JSON."""

from __future__ import annotations

import pytest

from anbudsklar.ai.engine import EngineOutputError
from anbudsklar.ai.jsonio import (
    OutputProblem,
    extract_json_object,
    parse_output,
    request_validated,
    retry_message,
)
from anbudsklar.contracts import Answer, Checklist

VALID_ANSWER = '{"answer": "Ja.", "found_in_document": true, "suggest_formal_question": false}'


def test_extracts_from_code_fence() -> None:
    text = f"Här är svaret:\n```json\n{VALID_ANSWER}\n```\nHoppas det hjälper."
    assert extract_json_object(text)["answer"] == "Ja."


def test_extracts_from_prose_and_skips_non_json_braces() -> None:
    text = 'Mallen {inte json} följs: {"a": {"b": "}"}} och sedan text.'
    assert extract_json_object(text) == {"a": {"b": "}"}}


def test_no_json_is_a_problem() -> None:
    with pytest.raises(OutputProblem, match="inget giltigt JSON-objekt"):
        extract_json_object("Jag kan tyvärr inte svara på det.")


def test_parse_output_reports_swedish_locations() -> None:
    requirement = '{"id": "K1", "kind": "annat", "title": "t", "plain_language": "p"}'
    text = f'{{"summary": "s", "requirements": [{requirement}]}}'
    with pytest.raises(OutputProblem) as raised:
        parse_output(text, Checklist)
    problems = raised.value.problems
    assert "requirements.0.kind: värdet är inte ett av de tillåtna" in problems
    assert "requirements.0.citation: fältet saknas" in problems


def test_retry_message_lists_and_truncates_problems() -> None:
    problem = OutputProblem([f"fält{index}: fältet saknas" for index in range(15)])
    message = retry_message(problem)
    assert "- fält0: fältet saknas" in message
    assert "- fält11: fältet saknas" in message
    assert "fält12" not in message
    assert "- och 3 fel till" in message
    assert "enda JSON-objekt" in message


async def test_request_validated_retries_in_the_same_conversation() -> None:
    sent: list[str] = []
    replies = iter(["inte json", VALID_ANSWER])

    async def send(message: str) -> str:
        sent.append(message)
        return next(replies)

    answer, attempts = await request_validated(Answer, "första", send, max_retries=2)
    assert answer.found_in_document is True
    assert attempts == 2
    assert sent[0] == "första"
    assert sent[1].startswith("Ditt förra svar kunde inte användas")


async def test_request_validated_gives_up_after_the_last_retry() -> None:
    calls = 0

    async def send(message: str) -> str:
        nonlocal calls
        calls += 1
        return "{}"

    with pytest.raises(EngineOutputError, match="efter 2 försök"):
        await request_validated(Answer, "första", send, max_retries=1)
    assert calls == 2
