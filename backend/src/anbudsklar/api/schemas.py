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
    DeadlineKind,
    MatchAssessment,
    ReviewResult,
    RulesAnswer,
)
from anbudsklar.search.types import NoticeOrder

Role = Literal["foretagare", "inkopare"]
ChecklistStatus = Literal["none", "draft", "approved", "published", "rejected"]
NoticeStatus = Literal["open", "closed", "awarded", "planned"]
Fit = Literal["passar", "passar_delvis", "passar_inte"]
InterpretationState = Literal["pending", "retrying", "failed"]
ChecklistProgressState = Literal["queued", "running", "retrying"]
# "deadline": soonest sista anbudsdag first, notices without one last; "published": newest
# first; "relevance": best text match first (newest first when there is no text).
NoticeSort = NoticeOrder

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


class LabInfo(ApiModel):
    """When a lab company is deleted (decision 0010)."""

    expires_at: datetime


class LabCompanyRef(ApiModel):
    """A lab company the login page offers to continue as."""

    id: uuid.UUID
    name: str


class UserView(ApiModel):
    id: uuid.UUID
    name: str
    email: str
    role: Role
    company: CompanyRef | None = None
    lab: LabInfo | None = None  # set for a lab company's participant


class Persona(ApiModel):
    key: Role
    label: str
    description: str


class SessionView(ApiModel):
    user: UserView | None
    personas: list[Persona]
    # Lab companies to continue as (decision 0010); empty when the lab is off.
    lab_companies: list[LabCompanyRef] = Field(default_factory=list)


class LoginRequest(ApiModel):
    persona: Role


class GateRequest(ApiModel):
    code: str = Field(min_length=1, max_length=200)


class LabCreateRequest(ApiModel):
    name: str = Field(min_length=2, max_length=120)


class LabLoginRequest(ApiModel):
    company_id: uuid.UUID


class AppConfig(ApiModel):
    organization_name: str
    ai_engine: str
    ai_disclosure: str
    demo_notice: str  # explains what is fictitious in the PoC
    eavrop_url: str  # the municipality's page in e-Avrop, for notices without a page of their own
    gate_required: bool  # the service wants its access code before anything else (decision 0010)
    lab_enabled: bool  # the login page offers "Prova med ditt eget företag" (decision 0010)
    review_required: bool  # inköp reviews checklists before companies see them (decisions 0011 and 0017)


# --- Notices ------------------------------------------------------------------------


class NoticeSummary(ApiModel):
    id: uuid.UUID
    title: str
    buyer: str | None
    # The reference people quote for the procurement ("DEMO-2026-0147"): the buyer's own
    # identifier from TED (eForms BT-22), e-Avrop's id, or what the buyer entered. None when
    # the source names none, as TED does for notices that e-Avrop published.
    reference_number: str | None = None
    source: str
    status: NoticeStatus
    published_at: datetime | None
    deadline_at: datetime | None
    # What `deadline_at` is the last day for: "tender" (sista anbudsdag) or "request" (sista
    # dag för anbudsansökan, all a restricted procedure's notice in TED gives).
    deadline_kind: DeadlineKind = "tender"
    # Frågestopp as the end of that day in Stockholm (like AnswerView.question_deadline): the
    # source's own date (e-Avrop) when it gives one, else the published checklist's. The
    # last day for questions, so show it as a date.
    question_deadline: datetime | None = None
    cpv_codes: list[str]
    cpv_label: str | None = None  # Swedish label of the main (first) CPV code, when the code is known
    has_documents: bool
    checklist_status: ChecklistStatus
    # The published checklist was approved by inköp; False when published without review (decision 0011).
    checklist_reviewed: bool = False
    is_fictitious: bool
    fit: Fit | None = None  # for the signed-in company, when assessed


class NoticeCounts(ApiModel):
    """How many notices each status choice would list with the same filters (status and paging ignored)."""

    open: int
    planned: int
    all: int


class NoticeList(ApiModel):
    items: list[NoticeSummary]
    total: int
    counts: NoticeCounts
    sort: NoticeSort  # the order of `items`: the requested one, else the default for the filters


class NoticeBuyer(ApiModel):
    """One buyer for the list's buyer filter.

    A joint procurement names several buyers, and each of them is listed on its own. `count`
    is what `GET /api/notices?buyer=<name>` totals with the same other filters, where the
    filter matches any notice whose buyer contains the name (case does not matter).
    """

    name: str
    count: int


class NoticeBuyers(ApiModel):
    items: list[NoticeBuyer]  # most notices first, then by name


class DocumentInfo(ApiModel):
    id: uuid.UUID
    filename: str
    page_count: int
    # Pages without readable text (scans, images): what the AI never saw, so the reader can
    # check those pages in the file itself.
    empty_pages: int = 0
    is_fictitious: bool


class UnreadFile(ApiModel):
    """A file the source lists for the procurement that Anbudshjälpen could not read in.

    The reader is told it exists and why it is missing here, so that the documents shown
    are never taken for the whole set.
    """

    filename: str
    reason: str  # Swedish, as the ingestion wrote it: the format, the size or an unreadable file


DocumentOrigin = Literal["eavrop", "upload", "archive", "fixture", "manual"]
"""How a stored file got here: fetched from e-Avrop, uploaded by inköp, unpacked from an
archive among the notice's files, loaded as demo data, or added by hand."""


class DocumentReading(ApiModel):
    """How one stored file was read in, for "Så lästes underlaget" (the demo's trace).

    Every value is something the app already keeps about the file; nothing is logged for
    the trace. Replaced versions are included, so the reader sees that a newer file took
    over, and the page count and the characters say what the engines could read.
    """

    id: uuid.UUID
    filename: str
    origin: DocumentOrigin
    archive: str | None = None  # the archive the file was unpacked from, when origin is "archive"
    mimetype: str
    size_bytes: int
    stored_at: datetime  # when the file was fetched, uploaded or unpacked
    page_count: int
    empty_pages: int
    characters: int  # the text of all pages, what the engines and the search read
    # "eavrop" when the file is an export from e-Avrop's forms, whose footer was stripped and
    # whose fields the engines are told about (decision 0020); None otherwise.
    layout: str | None
    extraction_version: int  # the text extraction that made the pages
    is_main: bool  # the document the worker interprets to a checklist on its own
    superseded_by: uuid.UUID | None  # the newer file that took over, when the source replaced it
    superseded_at: datetime | None  # when that newer file was stored


class ReadingReport(ApiModel):
    """What happened to a notice's files, as the demo panel "Så lästes underlaget" shows it.

    The checklist's own events (interpreted, approved, published) and the published answers
    are already on the notice detail; this adds the files, replaced versions included.
    """

    notice_id: uuid.UUID
    source: str
    fetched_at: datetime  # when the notice was first stored
    updated_at: datetime  # when the source last changed it
    documents: list[DocumentReading]  # every stored file, oldest first, replaced ones included
    unread_files: list[UnreadFile] = Field(default_factory=list)
    budget_chars: int  # what one interpretation or answer may be given at most (decision 0012)
    extraction_version: int  # the extraction the app runs now; an older document is read again


class ReadSummary(ApiModel):
    """What the engine was given (decision 0012), so the app can say so."""

    documents_read: int
    documents_total: int
    pages_read: int
    pages_total: int


class VerificationSummary(ApiModel):
    citations_total: int = 0
    citations_verified: int = 0
    citations_moved: int = 0
    citations_unverified: int = 0
    # What the interpretation read (decision 0020); None on checklists made before it.
    read: ReadSummary | None = None


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
    # Inköp approved it. False for a checklist published without review (decision 0011).
    reviewed: bool
    reviewer_note: str | None
    verification: VerificationSummary
    checklist: Checklist


class MatchView(ApiModel):
    id: uuid.UUID
    notice: NoticeSummary
    fit: Fit
    assessment: MatchAssessment
    engine: str  # heuristic, eneo or openai: who made the assessment (never reviewed by inköp)
    created_at: datetime  # when the assessment was made


class PublishedAnswerView(ApiModel):
    """A question a supplier asked in e-Avrop and the answer the buyer published there (decision 0013).

    Public for every supplier, and never says who asked. `asked_at` is missing when the
    source's log gave no time for the question.
    """

    source: str  # eavrop
    key: str  # stable across reads; a citation of the answer names it (decision 0018)
    question: str
    answer: str
    asked_at: datetime | None
    answered_at: datetime


class ChecklistProgress(ApiModel):
    """Where a checklist on its way is (decision 0019), so the notice page says more than "soon".

    `queued`: the worker has not got to the document yet; `running`: the interpretation job
    runs right now; `retrying`: an attempt failed and the worker tries again from `retry_at`.
    """

    state: ChecklistProgressState
    attempts: int  # failed attempts so far
    max_attempts: int  # after which the worker gives up
    retry_at: datetime | None  # the earliest next attempt after a failure
    next_run_at: datetime | None  # when the worker's next run is due; None when it has not run lately
    last_run_at: datetime | None  # when the interpretation job last started


class NoticeDetail(NoticeSummary):
    description: str | None
    procedure: str | None
    url: str | None
    documents_url: str | None
    # TED's notice of a procurement stored from e-Avrop, which also went to TED (decision 0021).
    ted_url: str | None = None
    place: str | None
    estimated_value_sek: int | None
    cpv_labels: dict[str, str] = Field(default_factory=dict)  # code -> Swedish label, for known codes
    documents: list[DocumentInfo]  # the current documents; a file the source replaced is left out
    # Files the source lists that were not read in, so the list above is never taken for all of them.
    unread_files: list[UnreadFile] = Field(default_factory=list)
    checklist: ChecklistView | None  # companies only see published checklists
    # Where a checklist on its way is; None when none is coming, so a page never promises a
    # checklist that the worker will not make (decision 0019).
    checklist_progress: ChecklistProgress | None = None
    match: MatchView | None = None
    # The buyer's published answers to suppliers' questions, oldest answer first, as e-Avrop numbers them.
    published_answers: list[PublishedAnswerView] = Field(default_factory=list)


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


class TokenUsageView(ApiModel):
    """What one answer cost: tokens as the model provider counted them, and money when a price is set.

    Shown in the provenance popover. None on a view when the engine reported no counts (the
    heuristic engine has no model; the Eneo adapter does not read Eneo's counts yet).
    """

    input_tokens: int
    output_tokens: int
    cost_sek: float | None  # None until AI_PRICE_INPUT_SEK_PER_MILLION and the output price are set


class AnswerView(ApiModel):
    answer: Answer
    engine: str
    usage: TokenUsageView | None = None
    document_id: uuid.UUID  # the main document; a citation's own document_id says where its quote is
    read: ReadSummary
    # Frågestopp as the end of that day in Stockholm: the source's date, else the published
    # checklist's. The date is the last day for questions, so show it as a date.
    question_deadline: datetime | None
    formal_question_url: str  # where to ask formally: the procurement in e-Avrop, else e-Avrop itself


class ReviewView(ApiModel):
    result: ReviewResult
    requirement_titles: dict[str, str]  # requirement id -> title, for display
    engine: str
    usage: TokenUsageView | None = None
    stored: Literal[False] = False  # the draft is never stored


# "anbudsansokan" follows the notice's deadline when it is one for requests to participate
# (`NoticeSummary.deadline_kind` "request"); "sista_anbudsdag" then follows the checklist only.
ReminderKind = Literal["fragestopp", "sista_anbudsdag", "anbudsansokan", "egen"]


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
    due_at: datetime  # when the e-mail is sent, which is not the deadline
    # The deadline the reminder is about, so the UI never works it out: for sista anbudsdag
    # the notice's own deadline (with its time) when it falls on the day the reminder follows,
    # for anbudsansökan the notice's own deadline, otherwise the end of that day in Stockholm
    # (frågestopp is a date: show it as one).
    # None for "egen" reminders and when the deadline is no longer known.
    deadline_at: datetime | None = None
    sent_at: datetime | None


# --- Profile, CPV and matches -------------------------------------------------------


class CompanyView(ApiModel):
    id: uuid.UUID
    org_number: str | None
    name: str
    description: str
    cpv_codes: list[str]
    cpv_labels: dict[str, str] = Field(default_factory=dict)
    # Every CPV division ("45000000" -> "Anläggningsarbete"), so the chosen codes can be grouped by area.
    cpv_divisions: dict[str, str] = Field(default_factory=dict)
    municipalities: list[str]
    employees: int | None
    annual_turnover_sek: int | None
    certifications: list[str]
    insurance: str | None
    public_references: str | None
    is_fictitious: bool


class ProfileSaved(CompanyView):
    """The saved profile (`CompanyView`) and how many open notices seem to fit it now."""

    # The match cards Start shows after the save re-assessed them: open for tenders, fit
    # "passar" or "passar_delvis", not dismissed. None when the re-assessment runs after the
    # response, as it does with a language model (seconds per notice): Start has them when done.
    fitting_notices: int | None = None


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
    usage: TokenUsageView | None = None  # the sum of the two calls behind the suggestions


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
    usage: TokenUsageView | None = None


# --- Buyer (inköpare) views ---------------------------------------------------------


class ChecklistAdminItem(ApiModel):
    id: uuid.UUID
    notice_id: uuid.UUID
    notice_title: str
    deadline_at: datetime | None  # the notice's deadline; the queue is sorted on it
    deadline_kind: DeadlineKind = "tender"  # as NoticeSummary.deadline_kind
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
    reference_number: str | None = Field(default=None, max_length=100)  # the buyer's diarienummer
    description: str | None = Field(default=None, max_length=8000)
    cpv_codes: list[CpvCodeIn] = Field(default_factory=list, max_length=30)
    procedure: str | None = Field(default=None, max_length=300)
    deadline_at: datetime | None = None
    deadline_kind: DeadlineKind = "tender"  # what `deadline_at` is the last day for, as NoticeSummary has it
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
    """A document without a checklist yet, or whose new interpretation after inköp's answers failed (0018)."""

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
    # Sista anbudsdag, when the tender period ends: the notice's own deadline, or for a notice
    # that only gives the last day for anbudsansökan the published checklist's; else None.
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


class AiUsageTaskView(ApiModel):
    """One AI task's calls in the period, in the tasks' own order (contracts.Task)."""

    task: str
    calls: int
    calls_with_usage: int  # calls whose tokens the engine reported; the token sums cover only these
    input_tokens: int
    output_tokens: int
    cost_sek: float | None


class AiUsageModelView(ApiModel):
    """One engine and model's calls in the period, the most used first."""

    engine: str
    model: str | None
    calls: int
    calls_with_usage: int
    input_tokens: int
    output_tokens: int
    cost_sek: float | None


class AiUsageView(ApiModel):
    """The AI engine's usage over the last `days` days, for Drift: calls, tokens and the estimated cost.

    The cost is `None` until the operator sets both prices (`AI_PRICE_INPUT_SEK_PER_MILLION`
    and `AI_PRICE_OUTPUT_SEK_PER_MILLION`), which the view echoes so the page can say so.
    """

    since: datetime
    until: datetime
    days: int
    calls: int
    calls_with_usage: int
    input_tokens: int
    output_tokens: int
    cost_sek: float | None
    price_input_sek_per_million: float | None
    price_output_sek_per_million: float | None
    by_task: list[AiUsageTaskView]
    by_model: list[AiUsageModelView]


class AppSettingsView(ApiModel):
    """Settings inköp changes at run time (decision 0011)."""

    review_required: bool  # inköp reviews checklists before companies see them


class AppSettingsUpdate(ApiModel):
    review_required: bool


class AppSettingsSaved(AppSettingsView):
    published_now: int  # checklists published because the review was turned off


JobName = Literal[
    "ingest_ted",
    "ingest_eavrop",
    "ingest_lou",
    "close_expired",
    "interpret_pending",
    "reextract_outdated",
    "match_all",
    "send_reminders",
    "notify_matches",
    "purge_lab",
]


class ErrorView(ApiModel):
    detail: str
