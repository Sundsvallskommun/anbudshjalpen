"""REST contract between the backend and the React app.

This module is the source of truth for request and response shapes under `/api`.
The frontend mirrors these types in `frontend/src/api/types.ts`. Contract models from
`anbudsklar.contracts` are reused directly where the UI shows AI output, so citations
carry their verification status (`check`) all the way to the screen.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from anbudsklar.contracts import (
    Answer,
    Checklist,
    CpvSuggestions,
    MatchAssessment,
    ReviewResult,
    RulesAnswer,
)

Role = Literal["foretagare", "inkopare"]
ChecklistStatus = Literal["none", "draft", "approved", "published", "rejected"]
NoticeStatus = Literal["open", "closed", "awarded", "planned"]
Fit = Literal["passar", "passar_delvis", "passar_inte"]
InterpretationState = Literal["pending", "retrying", "failed"]

# List items in request bodies get their own length cap, not only the list.
CpvCodeIn = Annotated[str, Field(max_length=16)]
Municipality = Annotated[str, Field(max_length=100)]
Certification = Annotated[str, Field(max_length=200)]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Session and configuration ------------------------------------------------------


class CompanyRef(ApiModel):
    id: uuid.UUID
    name: str


class UserView(ApiModel):
    id: uuid.UUID
    name: str
    email: str
    role: Role
    company: CompanyRef | None = None


class Persona(ApiModel):
    key: Role
    label: str
    description: str


class SessionView(ApiModel):
    user: UserView | None
    personas: list[Persona]


class LoginRequest(ApiModel):
    persona: Role


class AppConfig(ApiModel):
    organization_name: str
    ai_engine: str
    ai_disclosure: str
    demo_notice: str  # explains what is fictitious in the PoC
    eavrop_url: str  # the municipality's page in e-Avrop, for notices without a page of their own


# --- Notices ------------------------------------------------------------------------


class NoticeSummary(ApiModel):
    id: uuid.UUID
    title: str
    buyer: str | None
    source: str
    status: NoticeStatus
    published_at: datetime | None
    deadline_at: datetime | None
    cpv_codes: list[str]
    has_documents: bool
    checklist_status: ChecklistStatus
    is_fictitious: bool
    fit: Fit | None = None  # for the signed-in company, when assessed


class NoticeList(ApiModel):
    items: list[NoticeSummary]
    total: int


class DocumentInfo(ApiModel):
    id: uuid.UUID
    filename: str
    page_count: int
    is_fictitious: bool


class VerificationSummary(ApiModel):
    citations_total: int = 0
    citations_verified: int = 0
    citations_moved: int = 0
    citations_unverified: int = 0


class ChecklistView(ApiModel):
    id: uuid.UUID
    notice_id: uuid.UUID
    document_id: uuid.UUID
    status: ChecklistStatus
    engine: str
    model: str | None
    created_at: datetime
    approved_at: datetime | None
    published_at: datetime | None
    reviewer_note: str | None
    verification: VerificationSummary
    checklist: Checklist


class MatchView(ApiModel):
    id: uuid.UUID
    notice: NoticeSummary
    fit: Fit
    assessment: MatchAssessment
    created_at: datetime


class NoticeDetail(NoticeSummary):
    description: str | None
    procedure: str | None
    url: str | None
    documents_url: str | None
    place: str | None
    estimated_value_sek: int | None
    documents: list[DocumentInfo]
    checklist: ChecklistView | None  # companies only see published checklists
    match: MatchView | None = None


class PageView(ApiModel):
    document_id: uuid.UUID
    page_no: int
    page_count: int
    text: str


# --- Questions, review and reminders ------------------------------------------------


class QuestionTurnIn(ApiModel):
    question: str = Field(max_length=2000)
    answer: str = Field(max_length=8000)


class QuestionRequest(ApiModel):
    question: str = Field(min_length=3, max_length=2000)
    history: list[QuestionTurnIn] = Field(default_factory=list, max_length=10)


class AnswerView(ApiModel):
    answer: Answer
    engine: str
    document_id: uuid.UUID  # the document that was read; the answer's page citations refer to it
    # Frågestopp from the checklist, as the end of that day in Stockholm: the date is the
    # last day for questions, so show it as a date.
    question_deadline: datetime | None
    formal_question_url: str  # where to ask formally: the procurement in e-Avrop, else e-Avrop itself


class ReviewView(ApiModel):
    result: ReviewResult
    requirement_titles: dict[str, str]  # requirement id -> title, for display
    engine: str
    stored: Literal[False] = False  # the draft is never stored


ReminderKind = Literal["fragestopp", "sista_anbudsdag", "egen"]


class ReminderRequest(ApiModel):
    kind: ReminderKind
    due_at: datetime | None = None  # required for "egen"; derived from the checklist otherwise
    note: str | None = Field(default=None, max_length=500)


class ReminderView(ApiModel):
    id: uuid.UUID
    notice_id: uuid.UUID
    notice_title: str
    kind: ReminderKind
    note: str | None
    due_at: datetime
    sent_at: datetime | None


# --- Profile, CPV and matches -------------------------------------------------------


class CompanyView(ApiModel):
    id: uuid.UUID
    org_number: str | None
    name: str
    description: str
    cpv_codes: list[str]
    cpv_labels: dict[str, str] = Field(default_factory=dict)
    municipalities: list[str]
    employees: int | None
    annual_turnover_sek: int | None
    certifications: list[str]
    insurance: str | None
    public_references: str | None
    is_fictitious: bool


class CompanyUpdate(ApiModel):
    description: str = Field(max_length=4000)
    cpv_codes: list[CpvCodeIn] = Field(default_factory=list, max_length=30)
    municipalities: list[Municipality] = Field(default_factory=list, max_length=20)
    employees: int | None = Field(default=None, ge=0)
    annual_turnover_sek: int | None = Field(default=None, ge=0)
    certifications: list[Certification] = Field(default_factory=list, max_length=20)
    insurance: str | None = Field(default=None, max_length=500)
    public_references: str | None = Field(default=None, max_length=2000)


class CpvSuggestionRequest(ApiModel):
    description: str = Field(min_length=10, max_length=4000)


class CpvSuggestionView(ApiModel):
    suggestions: CpvSuggestions
    engine: str


class CpvHit(ApiModel):
    code: str
    label: str
    parent_code: str | None


class UpcomingProcurement(ApiModel):
    agreement_id: uuid.UUID
    title: str
    category: str | None
    cpv_codes: list[str]
    end_date: date
    max_end_date: date | None
    expected_from: date  # earliest likely announcement
    expected_to: date  # latest likely announcement
    previous_requirements: str | None
    is_fictitious: bool
    relevant_for_company: bool = False
    # The whole window lies in the past and no successor notice has been seen: it should
    # already have been announced, so look among the notices rather than wait.
    announcement_overdue: bool = False


# --- Rules help ---------------------------------------------------------------------


class RulesRequest(ApiModel):
    question: str = Field(min_length=3, max_length=2000)
    # A conversation this browser started (RulesAnswer.session_id). Any other id starts a new one.
    session_id: uuid.UUID | None = None


class RulesView(ApiModel):
    answer: RulesAnswer
    engine: str


# --- Buyer (inköpare) views ---------------------------------------------------------


class ChecklistAdminItem(ApiModel):
    id: uuid.UUID
    notice_id: uuid.UUID
    notice_title: str
    status: ChecklistStatus
    engine: str
    created_at: datetime
    verification: VerificationSummary
    requirement_count: int


class ChecklistUpdate(ApiModel):
    checklist: Checklist
    reviewer_note: str | None = Field(default=None, max_length=2000)


class RejectRequest(ApiModel):
    note: str = Field(min_length=3, max_length=2000)


class NoticeCreate(ApiModel):
    title: str = Field(min_length=3, max_length=500)
    buyer: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    cpv_codes: list[CpvCodeIn] = Field(default_factory=list, max_length=30)
    procedure: str | None = Field(default=None, max_length=300)
    deadline_at: datetime | None = None
    url: str | None = Field(default=None, max_length=2000)

    @field_validator("url")
    @classmethod
    def _web_address(cls, value: str | None) -> str | None:
        """The address becomes a link in the app, so only http(s) is accepted."""

        if value is None or not value.strip():
            return None
        value = value.strip()
        if not value.lower().startswith(("https://", "http://")):
            raise ValueError("Ange en webbadress som börjar med https://")
        return value


class InterpretationView(ApiModel):
    """A document that has no checklist yet, and where its interpretation stands."""

    document_id: uuid.UUID
    notice_id: uuid.UUID
    notice_title: str
    filename: str
    state: InterpretationState  # failed: the worker has given up; ask for a new interpretation
    attempts: int
    error: str | None
    retry_at: datetime | None
    created_at: datetime


class InsightItem(ApiModel):
    notice_id: uuid.UUID
    notice_title: str
    deadline_at: datetime | None
    question_count: int
    not_in_document_count: int
    formal_question_suggestions: int
    sample_questions: list[str]  # empty until the tender deadline has passed
    visible: bool  # False while the tender period is running


class JobRunView(ApiModel):
    id: uuid.UUID
    job: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    stats: dict[str, object]
    error: str | None


JobName = Literal[
    "ingest_ted",
    "ingest_eavrop",
    "ingest_lou",
    "close_expired",
    "interpret_pending",
    "match_all",
    "send_reminders",
    "notify_matches",
]


class ErrorView(ApiModel):
    detail: str
