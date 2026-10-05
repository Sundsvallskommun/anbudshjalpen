"""Turning model text into validated contract models.

Models wrap JSON in prose or code fences and sometimes break the contract. This module
extracts the first JSON object, validates it against the task contract and, when that
fails, writes a Swedish retry message that tells the model exactly what was wrong. The
retry loop is shared by every engine that talks to a language model.
"""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import ValidationError
from pydantic_core import ErrorDetails

from anbudsklar.ai.engine import EngineOutputError
from anbudsklar.contracts import ContractModel

_FENCE = re.compile(r"```(?:json|JSON)?\s*\n?(.*?)```", re.DOTALL)
_MAX_LISTED_PROBLEMS = 12

# Swedish wording for the validation errors models make most often.
_ERROR_TEXT: dict[str, str] = {
    "missing": "fältet saknas",
    "string_too_long": "texten är för lång",
    "string_too_short": "texten är för kort",
    "string_pattern_mismatch": "värdet har fel format",
    "literal_error": "värdet är inte ett av de tillåtna",
    "int_parsing": "värdet ska vara ett heltal",
    "int_type": "värdet ska vara ett heltal",
    "float_parsing": "värdet ska vara ett tal",
    "bool_parsing": "värdet ska vara true eller false",
    "bool_type": "värdet ska vara true eller false",
    "date_from_datetime_parsing": "datumet ska skrivas ÅÅÅÅ-MM-DD",
    "date_parsing": "datumet ska skrivas ÅÅÅÅ-MM-DD",
    "greater_than_equal": "värdet är för litet",
    "less_than_equal": "värdet är för stort",
    "too_long": "listan är för lång",
    "list_type": "värdet ska vara en lista",
    "dict_type": "värdet ska vara ett objekt",
    "model_type": "värdet ska vara ett objekt",
    "string_type": "värdet ska vara en text",
}


class OutputProblem(ValueError):
    """Model output that cannot be used as it is. `problems` are short Swedish lines."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def extract_json_object(text: str) -> dict[str, Any]:
    """The first JSON object in `text`, ignoring code fences and surrounding prose."""

    fenced = _FENCE.search(text)
    candidates = [fenced.group(1)] if fenced else []
    candidates.append(text)
    decoder = json.JSONDecoder()
    for candidate in candidates:
        start = candidate.find("{")
        while start != -1:
            try:
                value, _ = decoder.raw_decode(candidate, start)
            except json.JSONDecodeError:
                start = candidate.find("{", start + 1)
                continue
            if isinstance(value, dict):
                return value
            start = candidate.find("{", start + 1)
    raise OutputProblem(["svaret innehöll inget giltigt JSON-objekt"])


def _describe(error: ErrorDetails) -> str:
    location = ".".join(str(part) for part in error["loc"]) or "svaret"
    text = _ERROR_TEXT.get(error["type"], error["msg"])
    limit = (error.get("ctx") or {}).get("max_length")
    if limit is not None and error["type"] in {"string_too_long", "too_long"}:
        text = f"{text} (högst {limit})"
    return f"{location}: {text}"


def parse_output[M: ContractModel](text: str, model: type[M]) -> M:
    """Validate model text against a contract, raising `OutputProblem` with readable errors."""

    data = extract_json_object(text)
    try:
        return model.model_validate(data)
    except ValidationError as error:
        raise OutputProblem([_describe(item) for item in error.errors()]) from error


def retry_message(problem: OutputProblem) -> str:
    """A follow-up message asking the model to fix its previous answer."""

    listed = problem.problems[:_MAX_LISTED_PROBLEMS]
    more = len(problem.problems) - len(listed)
    lines = "\n".join(f"- {item}" for item in listed)
    if more > 0:
        lines += f"\n- och {more} fel till"
    return (
        "Ditt förra svar kunde inte användas eftersom det inte följer svarsformatet:\n"
        f"{lines}\n\n"
        "Svara igen med hela svaret som ett enda JSON-objekt enligt schemat, utan text före eller efter. "
        "Behåll innehållet och rätta bara felen."
    )


Send = Callable[[str], Awaitable[str]]


async def request_validated[M: ContractModel](
    model: type[M], first_message: str, send: Send, max_retries: int
) -> tuple[M, int]:
    """Ask, validate and retry in the same conversation; return the result and attempts used.

    `send` posts one user message in an ongoing conversation and returns the model's
    text. Raises `EngineOutputError` when the last allowed attempt is still invalid.
    """

    message = first_message
    attempts = max_retries + 1
    problem = OutputProblem(["inget svar"])
    for attempt in range(1, attempts + 1):
        text = await send(message)
        try:
            return parse_output(text, model), attempt
        except OutputProblem as error:
            problem = error
            message = retry_message(error)
    raise EngineOutputError(
        f"Språkmodellen gav inget svar som följer svarsformatet efter {attempts} försök "
        f"({'; '.join(problem.problems[:3])})."
    )
