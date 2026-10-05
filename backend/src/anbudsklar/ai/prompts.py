"""Prompt files and task messages for the AI tasks.

Each task has a Swedish prompt file in `ai/prompts/<task>.md`. It is the system prompt
for the OpenAI-compatible engine and the assistant instructions in Eneo, so people in
the organisation can read and edit it in one place. Shared rules live in
`_grundregler.md` and `_citatregler.md` and the output contract is generated from the
Pydantic model, so the prompt and the validator can never disagree.

The user message (`render_task_message`) carries the inputs as clearly delimited blocks
and ends with the instruction, because models follow long documents best when the
question comes last.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Sequence
from datetime import datetime
from functools import cache
from importlib.resources import files
from typing import Any
from zoneinfo import ZoneInfo

from anbudsklar.ai.engine import QuestionTurn, RuleContext
from anbudsklar.contracts import (
    TASK_OUTPUTS,
    Checklist,
    CompanyProfile,
    CpvCandidate,
    NoticeContext,
    PagedDocument,
    Task,
    model_output_schema,
)

STOCKHOLM = ZoneInfo("Europe/Stockholm")

# Tasks whose answer is free text rather than a JSON contract. Regelhjälpen is also a
# plain Eneo chat assistant (and later a widget), so it answers in prose and the
# engines build the `RulesAnswer` around that text.
TEXT_TASKS: frozenset[Task] = frozenset({Task.ANSWER_RULES})

_INCLUDES = {"grundregler": "_grundregler.md", "citatregler": "_citatregler.md"}
_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")

_FORMAT_INTRO = (
    "## Svarsformat\n\n"
    "Svara med ett enda JSON-objekt som följer JSON-schemat nedan. Skriv ingen text före eller efter "
    "objektet och använd inget kodblock. All text i fälten ska vara på svenska. Fält som saknar värde "
    "utelämnar du eller sätter till null. Hitta inte på värden för att fylla dem."
)

_CLOSING: dict[Task, str] = {
    Task.INTERPRET_DOCUMENT: "Gör en checklista av underlaget. Svara med JSON-objektet.",
    Task.ASSESS_MATCH: "Bedöm hur väl upphandlingen passar företaget. Svara med JSON-objektet.",
    Task.REVIEW_DRAFT: "Granska anbudsutkastet mot checklistan. Svara med JSON-objektet.",
    Task.ANSWER_QUESTION: "Besvara frågan i <fraga> utifrån underlaget. Svara med JSON-objektet.",
    Task.SUGGEST_CPV: "Föreslå CPV-koder ur kandidatlistan för företaget. Svara med JSON-objektet.",
    Task.ANSWER_RULES: "Besvara frågan i <fraga>.",
}

# Inputs per task, in the order they are rendered. All of them must be passed.
TASK_INPUTS: dict[Task, tuple[str, ...]] = {
    Task.INTERPRET_DOCUMENT: ("notice", "document"),
    Task.ASSESS_MATCH: ("profile", "notice", "checklist"),
    Task.REVIEW_DRAFT: ("checklist", "draft"),
    Task.ANSWER_QUESTION: ("notice", "document", "history", "question"),
    Task.SUGGEST_CPV: ("description", "candidates"),
    Task.ANSWER_RULES: ("context", "question"),
}


def _read(name: str) -> str:
    return files("anbudsklar.ai").joinpath("prompts", name).read_text(encoding="utf-8")


def output_schema_json(task: Task) -> str:
    """The task's JSON schema as shown to models (verification keys stripped)."""

    return json.dumps(model_output_schema(TASK_OUTPUTS[task]), ensure_ascii=False, indent=2)


def _format_section(task: Task) -> str:
    return f"{_FORMAT_INTRO}\n\n{output_schema_json(task)}"


@cache
def load_prompt(task: Task) -> str:
    """The complete system prompt for a task, with shared rules and contract inserted."""

    def substitute(match: re.Match[str]) -> str:
        key = match.group(1)
        if key == "svarsformat":
            return _format_section(task)
        if key in _INCLUDES:
            return _read(_INCLUDES[key]).strip()
        raise KeyError(f"Unknown placeholder {{{{{key}}}}} in prompt for {task.value}")

    return _PLACEHOLDER.sub(substitute, _read(f"{task.value}.md")).strip() + "\n"


# --- Task messages ------------------------------------------------------------------


def _block(tag: str, content: str) -> str:
    # Inputs are untrusted text; dropping our own tag names keeps them from closing a block early.
    cleaned = re.sub(rf"</?{tag}>", "", content, flags=re.IGNORECASE).strip()
    return f"<{tag}>\n{cleaned}\n</{tag}>"


def _local_time(value: datetime) -> str:
    local = value.astimezone(STOCKHOLM) if value.tzinfo else value
    return local.strftime("%Y-%m-%d kl. %H:%M")


def _line(label: str, value: object | None) -> str:
    if value is None or value == "" or value == []:
        return f"{label}: uppgift saknas"
    if isinstance(value, list):
        return f"{label}: {', '.join(str(item) for item in value)}"
    return f"{label}: {value}"


def _render_notice(notice: NoticeContext) -> str:
    lines = [
        _line("Upphandlings-id", notice.notice_id),
        _line("Titel", notice.title),
        _line("Köpare", notice.buyer),
        _line("Förfarande", notice.procedure),
        _line("CPV-koder", notice.cpv_codes),
        _line("Sista anbudsdag", _local_time(notice.deadline_at) if notice.deadline_at else None),
        _line("Länk till annonsen", notice.url),
        _line("Beskrivning", notice.description),
    ]
    return _block("annons", "\n".join(lines))


def _render_document(document: PagedDocument) -> str:
    return _block("underlag", document.render())


def _render_draft(draft: PagedDocument) -> str:
    return _block("anbudsutkast", draft.render())


def _render_profile(profile: CompanyProfile) -> str:
    turnover = (
        f"{profile.annual_turnover_sek:,} kr".replace(",", " ") if profile.annual_turnover_sek else None
    )
    lines = [
        _line("Företag", profile.name),
        _line("Beskrivning", profile.description),
        _line("CPV-koder", profile.cpv_codes),
        _line("Verksamhetsorter", profile.municipalities),
        _line("Antal anställda", profile.employees),
        _line("Årsomsättning", turnover),
        _line("Certifieringar", profile.certifications),
        _line("Försäkring", profile.insurance),
        _line("Uppdrag för offentliga köpare", profile.public_references),
    ]
    return _block("foretagsprofil", "\n".join(lines))


def _render_checklist(checklist: Checklist | None) -> str:
    if checklist is None:
        return _block("checklista", "Det finns ingen checklista ännu. Bedöm utifrån annonsen och profilen.")
    lines: list[str] = []
    for requirement in checklist.requirements:
        lines.append(f"{requirement.id} ({requirement.kind}): {requirement.title}")
        if requirement.evidence:
            lines.append(f"  Bevis som efterfrågas: {requirement.evidence}")
        lines.append(f'  Källa: sida {requirement.citation.page}, "{requirement.citation.quote}"')
    if checklist.attachments:
        lines.append("")
        lines.append("Bilagor som ska lämnas:")
        lines.extend(
            f"- {attachment.name}" + (f": {attachment.description}" if attachment.description else "")
            for attachment in checklist.attachments
        )
    return _block("checklista", "\n".join(lines) if lines else "Checklistan innehåller inga krav.")


def _render_history(history: Sequence[QuestionTurn]) -> str:
    if not history:
        return ""
    turns = [f"Fråga: {turn.question}\nSvar: {turn.answer}" for turn in history]
    return _block("tidigare_fragor", "\n\n".join(turns))


def _render_question(question: str) -> str:
    return _block("fraga", question)


def _render_description(description: str) -> str:
    return _block("foretagsbeskrivning", description)


def _render_candidates(candidates: Sequence[CpvCandidate]) -> str:
    lines = [f"{candidate.code} – {candidate.label}" for candidate in candidates]
    return _block("cpv_kandidater", "\n".join(lines) if lines else "Inga kandidater hittades.")


def _render_context(context: Sequence[RuleContext]) -> str:
    if not context:
        return ""
    entries = []
    for item in context:
        header = f"{item.reference} – {item.title}"
        source = f"\nKälla: {item.url}" if item.url else ""
        entries.append(f"### {header}{source}\n{item.text.strip()}")
    return _block("regeltexter", "\n\n".join(entries))


_RENDERERS: dict[str, Callable[[Any], str]] = {
    "notice": _render_notice,
    "document": _render_document,
    "draft": _render_draft,
    "profile": _render_profile,
    "checklist": _render_checklist,
    "history": _render_history,
    "question": _render_question,
    "description": _render_description,
    "candidates": _render_candidates,
    "context": _render_context,
}


def render_task_message(task: Task, **inputs: Any) -> str:
    """The user message for one task run: input blocks first, the instruction last.

    Raises `TypeError` when an input is missing or unknown, so a wrong call fails in
    tests instead of silently producing a weaker prompt.
    """

    expected = TASK_INPUTS[task]
    missing = [name for name in expected if name not in inputs]
    unknown = sorted(set(inputs) - set(expected))
    if missing or unknown:
        raise TypeError(f"{task.value}: missing inputs {missing}, unknown inputs {unknown}")
    blocks = [_RENDERERS[name](inputs[name]) for name in expected]
    return "\n\n".join([block for block in blocks if block] + [_CLOSING[task]])
