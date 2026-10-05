"""Recoverable tool mistakes, answered as ordinary results instead of errors.

Eneo 2.2 counts every tool result marked `isError` as a failure of the whole MCP server.
After five in a row its circuit breaker turns the server off for 60 seconds, for every
user of the Eneo process, and Eneo runs a turn's tool calls in parallel. A model that asks
for page 30 of a nine-page document, mistypes an id or breaks a parameter limit has made
an ordinary mistake that its next call fixes. So the tools answer such mistakes with
guidance in a normal result, and only real failures, such as an unreachable database,
stay errors.
"""

from __future__ import annotations

from collections.abc import Sequence

from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.fastmcp.tools import Tool
from pydantic import ValidationError
from pydantic_core import ErrorDetails


class ToolGuidance(ToolError):
    """A mistake the model can fix itself; the message says how.

    It subclasses ToolError so that `ToolContext.session` lets it through untouched, and so
    that a code path which does not convert it still fails safely as an error.
    """


def recoverable_message(tool: Tool | None, error: ToolError) -> str | None:
    """The guidance to answer with when `error` is a recoverable mistake, else None.

    FastMCP wraps whatever a tool raises, argument validation included, in a ToolError of
    its own, so the mistake is found as the wrapper's cause.
    """

    for candidate in (error, error.__cause__):
        if isinstance(candidate, ToolGuidance):
            return str(candidate)
    cause = error.__cause__
    if tool is not None and isinstance(cause, ValidationError) and _is_argument_error(tool, cause):
        return argument_guidance(tool.name, cause)
    return None


def argument_guidance(tool_name: str, error: ValidationError) -> str:
    """Say in Swedish which arguments were wrong and why, so the model can call again."""

    problems = [f"- {_argument_name(detail['loc'])}: {_problem(detail)}" for detail in error.errors()]
    return "\n".join(
        [
            f"Fel i argumenten till {tool_name}, så inget hämtades:",
            *problems,
            f"Rätta argumenten och anropa {tool_name} igen.",
        ]
    )


def _is_argument_error(tool: Tool, error: ValidationError) -> bool:
    """True for the tool's own argument check, not a validation error raised inside the tool."""

    return error.title == tool.fn_metadata.arg_model.__name__


def _argument_name(location: Sequence[int | str]) -> str:
    """'cpv[0]' for ('cpv', 0); pydantic's union branch tags are left out."""

    if not location:
        return "argumenten"
    name = str(location[0])
    return name + "".join(f"[{part}]" for part in location[1:] if isinstance(part, int))


def _problem(detail: ErrorDetails) -> str:
    """The common pydantic errors in Swedish; anything else keeps pydantic's own message."""

    context = detail.get("ctx") or {}
    kind = detail["type"]
    if kind == "missing":
        return "saknas men krävs"
    if kind == "string_too_short":
        return f"måste ha minst {context.get('min_length')} tecken"
    if kind == "string_too_long":
        return f"får ha högst {context.get('max_length')} tecken"
    if kind == "too_long":
        return f"får ha högst {context.get('max_length')} värden"
    if kind == "greater_than_equal":
        return f"måste vara minst {context.get('ge')}"
    if kind == "less_than_equal":
        return f"får vara högst {context.get('le')}"
    if kind in {"int_parsing", "int_type", "int_from_float"}:
        return "måste vara ett heltal"
    if kind in {"date_parsing", "date_type", "date_from_datetime_parsing", "date_from_datetime_inexact"}:
        return "måste vara ett datum i formen ÅÅÅÅ-MM-DD"
    if kind == "literal_error":
        return f"måste vara {str(context.get('expected', '')).replace(' or ', ' eller ')}"
    if kind == "string_pattern_mismatch":
        return f"har fel format (ska matcha {context.get('pattern')})"
    if kind == "string_type":
        return "måste vara text"
    if kind == "list_type":
        return "måste vara en lista"
    return detail["msg"]
