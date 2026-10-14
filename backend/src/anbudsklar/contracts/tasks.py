"""Output contracts for the AI tasks.

One model per task. In production each task becomes an Eneo Flow step whose output
contract is the JSON schema of the model here (see `model_output_schema`).
"""

from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Literal

from pydantic import Field

from anbudsklar.contracts.common import AnswerCitation, Citation, CitationCheck, ContractModel
from anbudsklar.contracts.inputs import Subject

CONTRACT_VERSION = "2026-10-13"


class Task(StrEnum):
    """The AI tasks. Values double as prompt file names and Eneo assistant keys."""

    INTERPRET_DOCUMENT = "tolka_underlag"
    ASSESS_MATCH = "bedom_matchning"
    REVIEW_DRAFT = "granska_utkast"
    ANSWER_QUESTION = "besvara_fraga"
    SUGGEST_CPV = "foresla_cpv"
    ANSWER_RULES = "regelhjalpen"
    UPDATE_PROFILE = "uppdatera_profil"
    CHOOSE_SUBJECT = "valj_amne"


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
    answer_citation: AnswerCitation | None = Field(
        default=None,
        description="A published answer that changes or clarifies this requirement. plain_language "
        "then says what applies after the answer.",
    )


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
        default_factory=list,
        description="Things the document does not make clear and no published answer settles.",
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
    """Output of besvara_fraga: an answer grounded in the procurement's documents."""

    answer: str
    found_in_document: bool
    citations: list[Citation] = Field(default_factory=list)
    answer_citations: list[AnswerCitation] = Field(
        default_factory=list,
        description="Quotes from the buyer's published answers that support the answer. A published "
        "answer goes before the documents where they differ.",
    )
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


RuleSourceKind = Literal["law", "policy"]


class RuleSource(ContractModel):
    title: str
    reference: str | None = Field(
        default=None, description="E.g. 'LOU 20 kap. 1 §' or 'Inköpsstrategin 5.2'."
    )
    url: str | None = None
    excerpt: str | None = Field(
        default=None,
        description="Set by our code from its own copy of the law or the steering document: the start of "
        "the section's text, cut after a whole sentence.",
    )
    kind: RuleSourceKind | None = Field(
        default=None,
        description="Set by our code: 'law' for a section of LOU, 'policy' for a section of one of the "
        "municipality's steering documents (decision 0022), None for guidance and web pages.",
    )
    note: str | None = Field(
        default=None,
        description="Set by our code for a steering document, e.g. 'Kommunens styrdokument, fastställt av "
        "kommunfullmäktige 2023-09-25.' The page shows it under the source's title.",
    )


class RulesAnswer(ContractModel):
    """Output of regelhjalpen: a general answer about procurement rules."""

    answer: str
    sources: list[RuleSource] = Field(default_factory=list)
    session_id: str | None = None


# --- uppdatera_profil ---------------------------------------------------------------


class ProfileChange(ContractModel):
    """Output of uppdatera_profil: what a message in Fråga AI changes in the company's profile.

    A field left null (or an empty list of codes) leaves that part of the profile as it is.
    Our code applies the change through the same validation as the profile form, so a
    CPV code must come from the candidates the task was given and never from the model.
    """

    reply: str = Field(
        description="One or two sentences to the company in plain Swedish: what is changed, or the "
        "question to ask when the message cannot be applied as it is."
    )
    needs_clarification: bool = Field(
        default=False,
        description="True when the message is unclear or asks for something the profile cannot hold. "
        "Nothing is changed then, and reply asks the question.",
    )
    description: str | None = Field(
        default=None, description="The whole new description of the company, when the message changes it."
    )
    cpv_add: list[str] = Field(
        default_factory=list,
        description="Codes from <cpv_kandidater> to add to the profile, eight digits each.",
    )
    cpv_remove: list[str] = Field(
        default_factory=list, description="Codes already in the profile to remove, eight digits each."
    )
    municipalities: list[str] | None = Field(
        default=None, description="The whole new list of municipalities the company works in."
    )
    employees: int | None = Field(default=None, ge=0)
    annual_turnover_sek: int | None = Field(default=None, ge=0, description="Whole kronor per year.")
    certifications: list[str] | None = Field(default=None, description="The whole new list.")
    insurance: str | None = Field(default=None, description="An empty string removes the entry.")
    public_references: str | None = Field(default=None, description="An empty string removes the entry.")


# --- valj_amne ----------------------------------------------------------------------


class SubjectChoice(ContractModel):
    """Output of valj_amne: which of Fråga AI's subjects a message is for (decision 0026).

    Asked only when our own rules cannot tell. The subject must be one the task was
    given; our code falls back to the page's own subject otherwise.
    """

    subject: Subject = Field(description="One of the subjects listed in <amnen>.")
    reason: str = Field(
        max_length=300, description="One short sentence in Swedish on what settled the choice."
    )


TASK_OUTPUTS: dict[Task, type[ContractModel]] = {
    Task.INTERPRET_DOCUMENT: Checklist,
    Task.ASSESS_MATCH: MatchAssessment,
    Task.REVIEW_DRAFT: ReviewResult,
    Task.ANSWER_QUESTION: Answer,
    Task.SUGGEST_CPV: CpvSuggestions,
    Task.ANSWER_RULES: RulesAnswer,
    Task.UPDATE_PROFILE: ProfileChange,
    Task.CHOOSE_SUBJECT: SubjectChoice,
}
