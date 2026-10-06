"""Output contracts for the AI tasks.

One model per task. In production each task becomes an Eneo Flow step whose output
contract is the JSON schema of the model here (see `model_output_schema`).
"""

from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Literal

from pydantic import Field

from anbudsklar.contracts.common import Citation, CitationCheck, ContractModel

CONTRACT_VERSION = "2026-10-05"


class Task(StrEnum):
    """The AI tasks. Values double as prompt file names and Eneo assistant keys."""

    INTERPRET_DOCUMENT = "tolka_underlag"
    ASSESS_MATCH = "bedom_matchning"
    REVIEW_DRAFT = "granska_utkast"
    ANSWER_QUESTION = "besvara_fraga"
    SUGGEST_CPV = "foresla_cpv"
    ANSWER_RULES = "regelhjalpen"


# --- tolka_underlag -----------------------------------------------------------------

RequirementKind = Literal["skallkrav", "kvalificeringskrav", "krav_pa_uppdraget", "avtalsvillkor"]
DateKind = Literal[
    "fragestopp", "sista_anbudsdag", "anbudets_giltighet", "tilldelning", "avtalsstart", "annat"
]


class Requirement(ContractModel):
    id: str = Field(description="Short stable id within the checklist, e.g. K1, K2.")
    kind: RequirementKind
    title: str = Field(max_length=160)
    plain_language: str = Field(description="What the requirement means, in plain Swedish.")
    evidence: str | None = Field(
        default=None, description="What the supplier must submit to prove it, if stated."
    )
    citation: Citation


class RequiredAttachment(ContractModel):
    name: str
    description: str | None = None
    citation: Citation


class EvaluationCriterion(ContractModel):
    name: str
    weight_percent: float | None = Field(default=None, ge=0, le=100)
    how_assessed: str
    citation: Citation


class KeyDate(ContractModel):
    kind: DateKind
    date: dt.date | None = None
    description: str
    citation: Citation


class TermExplanation(ContractModel):
    term: str
    explanation: str = Field(description="What the term means in this particular procurement.")
    citation: Citation | None = None


class Checklist(ContractModel):
    """Output of tolka_underlag: the procurement document as a plain-language checklist."""

    summary: str = Field(description="Two to four sentences in plain Swedish.")
    procedure: str | None = None
    requirements: list[Requirement]
    attachments: list[RequiredAttachment] = Field(default_factory=list)
    evaluation: list[EvaluationCriterion] = Field(default_factory=list)
    dates: list[KeyDate] = Field(default_factory=list)
    terms: list[TermExplanation] = Field(default_factory=list)
    open_questions: list[str] = Field(
        default_factory=list, description="Things the document does not make clear."
    )


# --- bedom_matchning ----------------------------------------------------------------

Fit = Literal["passar", "passar_delvis", "passar_inte"]


class MatchReason(ContractModel):
    kind: Literal["styrka", "hinder", "oklart"]
    text: str
    requirement_id: str | None = None
    citation: Citation | None = None


class MatchAssessment(ContractModel):
    """Output of bedom_matchning: an honest fit assessment for one company and notice."""

    fit: Fit
    summary: str
    reasons: list[MatchReason]


# --- granska_utkast -----------------------------------------------------------------

CheckStatus = Literal["uppfyllt", "obevisat", "saknas", "oklart"]


class RequirementCheck(ContractModel):
    requirement_id: str
    status: CheckStatus
    comment: str
    draft_quote: str | None = Field(
        default=None, description="Verbatim text from the draft that addresses the requirement."
    )
    draft_page: int | None = Field(default=None, ge=1)
    draft_check: CitationCheck | None = None


class AttachmentCheck(ContractModel):
    name: str
    status: Literal["bifogad", "saknas", "oklart"]
    comment: str


class ReviewResult(ContractModel):
    """Output of granska_utkast. Flags problems; never rewrites the draft."""

    summary: str
    checks: list[RequirementCheck]
    attachments: list[AttachmentCheck] = Field(default_factory=list)


# --- besvara_fraga ------------------------------------------------------------------


class Answer(ContractModel):
    """Output of besvara_fraga: an answer grounded in one procurement document."""

    answer: str
    found_in_document: bool
    citations: list[Citation] = Field(default_factory=list)
    suggest_formal_question: bool = Field(
        description="True when the document does not settle the question and it should be asked "
        "formally in e-Avrop before the question deadline, so the answer reaches all suppliers."
    )


# --- foresla_cpv --------------------------------------------------------------------


class CpvSuggestion(ContractModel):
    code: str = Field(pattern=r"^\d{8}$")
    label: str
    reason: str


class CpvSuggestions(ContractModel):
    suggestions: list[CpvSuggestion] = Field(max_length=8)


# --- regelhjalpen -------------------------------------------------------------------


class RuleSource(ContractModel):
    title: str
    reference: str | None = Field(default=None, description="E.g. 'LOU 20 kap. 1 §'.")
    url: str | None = None
    excerpt: str | None = Field(
        default=None,
        description="Set by our code from its own copy of the law: the start of the section's text, "
        "cut after a whole sentence.",
    )


class RulesAnswer(ContractModel):
    """Output of regelhjalpen: a general answer about procurement rules."""

    answer: str
    sources: list[RuleSource] = Field(default_factory=list)
    session_id: str | None = None


TASK_OUTPUTS: dict[Task, type[ContractModel]] = {
    Task.INTERPRET_DOCUMENT: Checklist,
    Task.ASSESS_MATCH: MatchAssessment,
    Task.REVIEW_DRAFT: ReviewResult,
    Task.ANSWER_QUESTION: Answer,
    Task.SUGGEST_CPV: CpvSuggestions,
    Task.ANSWER_RULES: RulesAnswer,
}
