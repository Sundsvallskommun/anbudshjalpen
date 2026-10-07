/**
 * The REST contract with the backend, mirrored by hand.
 *
 * Source of truth: backend/src/anbudsklar/api/schemas.py (request and response models) and
 * backend/src/anbudsklar/contracts/ (the AI task contracts the API returns as they are). Keep the
 * names, optionality and literals identical; a change there is a change here in the same commit.
 *
 * JSON mapping: uuid.UUID -> string, datetime -> ISO 8601 string with offset, date -> "YYYY-MM-DD".
 */

export type Uuid = string;
export type IsoDateTime = string;
export type IsoDate = string;

// --- contracts/common.py -----------------------------------------------------------------------

export type CitationCheck = "verified" | "moved" | "unverified";

/** A verbatim quote from a document page that supports a claim. `check` is set by our verifier. */
export interface Citation {
  page: number;
  quote: string;
  check: CitationCheck | null;
  found_page: number | null;
}

// --- contracts/tasks.py ------------------------------------------------------------------------

export type RequirementKind = "skallkrav" | "kvalificeringskrav" | "krav_pa_uppdraget" | "avtalsvillkor";

export type DateKind =
  | "fragestopp"
  | "sista_anbudsdag"
  | "anbudets_giltighet"
  | "tilldelning"
  | "avtalsstart"
  | "annat";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  title: string;
  plain_language: string;
  evidence: string | null;
  citation: Citation;
}

export interface RequiredAttachment {
  name: string;
  description: string | null;
  citation: Citation;
}

export interface EvaluationCriterion {
  name: string;
  weight_percent: number | null;
  how_assessed: string;
  citation: Citation;
}

export interface KeyDate {
  kind: DateKind;
  date: IsoDate | null;
  description: string;
  citation: Citation;
}

export interface TermExplanation {
  term: string;
  explanation: string;
  citation: Citation | null;
}

/** Output of tolka_underlag: the procurement document as a plain-language checklist. */
export interface Checklist {
  summary: string;
  procedure: string | null;
  requirements: Requirement[];
  attachments: RequiredAttachment[];
  evaluation: EvaluationCriterion[];
  dates: KeyDate[];
  terms: TermExplanation[];
  open_questions: string[];
}

export type Fit = "passar" | "passar_delvis" | "passar_inte";

export interface MatchReason {
  kind: "styrka" | "hinder" | "oklart";
  text: string;
  requirement_id: string | null;
  citation: Citation | null;
}

export interface MatchAssessment {
  fit: Fit;
  summary: string;
  reasons: MatchReason[];
}

export type CheckStatus = "uppfyllt" | "obevisat" | "saknas" | "oklart";

export interface RequirementCheck {
  requirement_id: string;
  status: CheckStatus;
  comment: string;
  draft_quote: string | null;
  draft_page: number | null;
  draft_check: CitationCheck | null;
}

export interface AttachmentCheck {
  name: string;
  status: "bifogad" | "saknas" | "oklart";
  comment: string;
}

export interface ReviewResult {
  summary: string;
  checks: RequirementCheck[];
  attachments: AttachmentCheck[];
}

export interface Answer {
  answer: string;
  found_in_document: boolean;
  citations: Citation[];
  suggest_formal_question: boolean;
}

export interface CpvSuggestion {
  code: string;
  label: string;
  reason: string;
}

export interface CpvSuggestions {
  suggestions: CpvSuggestion[];
}

export interface RuleSource {
  title: string;
  reference: string | null;
  url: string | null;
  /**
   * The start of the law text itself, cut after a whole sentence and ending with " …" when shortened. Set by the
   * backend from its own copy of LOU (never by a model); null for sources that are not a LOU section it holds.
   */
  excerpt: string | null;
}

export interface RulesAnswer {
  answer: string;
  sources: RuleSource[];
  session_id: string | null;
}

// --- api/schemas.py: session and configuration -------------------------------------------------

export type Role = "foretagare" | "inkopare";
export type ChecklistStatus = "none" | "draft" | "approved" | "published" | "rejected";
export type NoticeStatus = "open" | "closed" | "awarded" | "planned";

export interface CompanyRef {
  id: Uuid;
  name: string;
}

export interface UserView {
  id: Uuid;
  name: string;
  email: string;
  role: Role;
  company: CompanyRef | null;
}

export interface Persona {
  key: Role;
  label: string;
  description: string;
}

export interface SessionView {
  user: UserView | null;
  personas: Persona[];
}

export interface LoginRequest {
  persona: Role;
}

export interface AppConfig {
  organization_name: string;
  ai_engine: string;
  ai_disclosure: string;
  demo_notice: string;
  /** The municipality's page in e-Avrop, for notices without a page of their own. */
  eavrop_url: string;
}

// --- api/schemas.py: notices -------------------------------------------------------------------

/**
 * The order of a notice list: "deadline" is soonest sista anbudsdag first (notices without one last), "published"
 * newest first, "relevance" best text match first.
 */
export type NoticeSort = "deadline" | "published" | "relevance";

/**
 * What a notice's `deadline_at` is the last day for: "tender" (sista anbudsdag) or "request" (sista dag för
 * anbudsansökan), which is all a restricted procedure's notice in TED gives; its tender deadline comes later.
 */
export type NoticeDeadlineKind = "tender" | "request";

export interface NoticeSummary {
  id: Uuid;
  title: string;
  buyer: string | null;
  /**
   * The reference people quote for the procurement, e.g. "DEMO-2026-0147": the buyer's own identifier from TED
   * (eForms BT-22), e-Avrop's id, or what the buyer entered. Null when the source names none, as TED does for the
   * notices e-Avrop published.
   */
  reference_number: string | null;
  source: string;
  status: NoticeStatus;
  published_at: IsoDateTime | null;
  deadline_at: IsoDateTime | null;
  deadline_kind: NoticeDeadlineKind;
  /**
   * Frågestopp from the published checklist, as the end of that day in Swedish time (like
   * AnswerView.question_deadline): a date, so show it as one. Null without a published checklist that names it.
   */
  question_deadline: IsoDateTime | null;
  cpv_codes: string[];
  /** The Swedish label of the main (first) CPV code, e.g. "Målning"; null when the code is not in the CPV list. */
  cpv_label: string | null;
  has_documents: boolean;
  checklist_status: ChecklistStatus;
  is_fictitious: boolean;
  fit: Fit | null;
}

/** How many notices each status choice would list with the current filters (status and paging ignored). */
export interface NoticeCounts {
  open: number;
  planned: number;
  all: number;
}

export interface NoticeList {
  items: NoticeSummary[];
  total: number;
  counts: NoticeCounts;
  /** The order `items` are in: the requested `sort`, else the default for the filters. */
  sort: NoticeSort;
}

/**
 * One buyer for the list's buyer filter. A joint procurement names several buyers, and each is listed on its own.
 * `count` is what `GET /api/notices?buyer=<name>` totals with the same other filters; the filter matches every notice
 * whose buyer contains the name, whatever its case.
 */
export interface NoticeBuyer {
  name: string;
  count: number;
}

/** GET /api/notices/buyers: most notices first, then by name. */
export interface NoticeBuyers {
  items: NoticeBuyer[];
}

export interface DocumentInfo {
  id: Uuid;
  filename: string;
  page_count: number;
  is_fictitious: boolean;
}

export interface VerificationSummary {
  citations_total: number;
  citations_verified: number;
  citations_moved: number;
  citations_unverified: number;
}

export interface ChecklistView {
  id: Uuid;
  notice_id: Uuid;
  document_id: Uuid;
  status: ChecklistStatus;
  engine: string;
  model: string | null;
  created_at: IsoDateTime;
  approved_at: IsoDateTime | null;
  published_at: IsoDateTime | null;
  reviewer_note: string | null;
  verification: VerificationSummary;
  checklist: Checklist;
}

export interface MatchView {
  id: Uuid;
  notice: NoticeSummary;
  fit: Fit;
  assessment: MatchAssessment;
  /** The engine that made the assessment ("heuristic", "eneo" or "openai"). Matches are never reviewed by inköp. */
  engine: string;
  /** When the assessment was made. */
  created_at: IsoDateTime;
}

export interface NoticeDetail extends NoticeSummary {
  description: string | null;
  procedure: string | null;
  url: string | null;
  documents_url: string | null;
  place: string | null;
  estimated_value_sek: number | null;
  /** CPV code -> Swedish label, for the codes in `cpv_codes` that are in the CPV list. */
  cpv_labels: Record<string, string>;
  documents: DocumentInfo[];
  checklist: ChecklistView | null;
  match: MatchView | null;
}

export interface PageView {
  document_id: Uuid;
  page_no: number;
  page_count: number;
  text: string;
}

// --- api/schemas.py: questions, review and reminders -------------------------------------------

export interface QuestionTurnIn {
  question: string;
  answer: string;
}

export interface QuestionRequest {
  question: string;
  history: QuestionTurnIn[];
}

export interface AnswerView {
  answer: Answer;
  engine: string;
  /** The document that was read; the answer's page citations refer to it. */
  document_id: Uuid;
  /** Frågestopp from the checklist, as the end of that day in Stockholm: a date, so show it as one. */
  question_deadline: IsoDateTime | null;
  /** Where to ask formally: the procurement in e-Avrop, else e-Avrop itself. */
  formal_question_url: string;
}

export interface ReviewView {
  result: ReviewResult;
  requirement_titles: Record<string, string>;
  engine: string;
  stored: false;
}

/**
 * "anbudsansokan" follows the notice's deadline when it is one for requests to participate (`deadline_kind`
 * "request"); "sista_anbudsdag" then follows the published checklist only.
 */
export type ReminderKind = "fragestopp" | "sista_anbudsdag" | "anbudsansokan" | "egen";

export interface ReminderRequest {
  kind: ReminderKind;
  due_at?: IsoDateTime | null;
  note?: string | null;
}

export interface ReminderView {
  id: Uuid;
  notice_id: Uuid;
  notice_title: string;
  kind: ReminderKind;
  note: string | null;
  /** When the e-mail is sent (or was due), not the deadline. */
  due_at: IsoDateTime;
  /**
   * The deadline the reminder is about, as the backend follows it: for sista_anbudsdag the notice's own deadline with
   * its time when it falls on that day, for anbudsansokan the notice's own deadline, otherwise the end of the
   * deadline's day in Swedish time (frågestopp is always a date: show it as one). Null for "egen" reminders and when
   * the deadline is no longer known.
   */
  deadline_at: IsoDateTime | null;
  sent_at: IsoDateTime | null;
}

// --- api/schemas.py: profile, CPV and matches --------------------------------------------------

export interface CompanyView {
  id: Uuid;
  org_number: string | null;
  name: string;
  description: string;
  cpv_codes: string[];
  cpv_labels: Record<string, string>;
  municipalities: string[];
  employees: number | null;
  annual_turnover_sek: number | null;
  certifications: string[];
  insurance: string | null;
  public_references: string | null;
  is_fictitious: boolean;
}

/** PUT /api/profile: the saved profile, and how many open notices seem to fit it now. */
export interface ProfileSaved extends CompanyView {
  /**
   * The match cards Start shows once the save has re-assessed them: open for tenders, fit "passar" or "passar_delvis",
   * not dismissed. Null when the re-assessment runs after the answer, as it does with a language model (seconds per
   * notice); Start has the new matches when it is done.
   */
  fitting_notices: number | null;
}

export interface CompanyUpdate {
  description: string;
  cpv_codes: string[];
  municipalities: string[];
  employees: number | null;
  annual_turnover_sek: number | null;
  certifications: string[];
  insurance: string | null;
  public_references: string | null;
}

export interface CpvSuggestionRequest {
  description: string;
}

export interface CpvSuggestionView {
  suggestions: CpvSuggestions;
  engine: string;
}

export interface CpvHit {
  code: string;
  label: string;
  parent_code: string | null;
}

export interface UpcomingProcurement {
  agreement_id: Uuid;
  title: string;
  category: string | null;
  cpv_codes: string[];
  end_date: IsoDate;
  max_end_date: IsoDate | null;
  expected_from: IsoDate;
  expected_to: IsoDate;
  previous_requirements: string | null;
  is_fictitious: boolean;
  relevant_for_company: boolean;
  /** The whole window lies in the past and no successor notice has been seen: look among the notices. */
  announcement_overdue: boolean;
}

// --- api/schemas.py: rules help ----------------------------------------------------------------

export interface RulesRequest {
  question: string;
  /** A conversation this browser started (RulesAnswer.session_id, a UUID); any other id starts a new one. */
  session_id: Uuid | null;
}

export interface RulesView {
  answer: RulesAnswer;
  engine: string;
}

// --- api/schemas.py: buyer (inköpare) views ----------------------------------------------------

/** A row in the buyer's queue, which comes sorted on `deadline_at` (soonest first, none last), then newest first. */
export interface ChecklistAdminItem {
  id: Uuid;
  notice_id: Uuid;
  notice_title: string;
  /** The notice's deadline, as NoticeSummary has it. */
  deadline_at: IsoDateTime | null;
  deadline_kind: NoticeDeadlineKind;
  status: ChecklistStatus;
  engine: string;
  created_at: IsoDateTime;
  verification: VerificationSummary;
  requirement_count: number;
}

export interface ChecklistUpdate {
  checklist: Checklist;
  reviewer_note: string | null;
}

export interface RejectRequest {
  note: string;
}

export interface NoticeCreate {
  title: string;
  buyer: string | null;
  /** The buyer's own reference (diarienummer); optional. */
  reference_number?: string | null;
  description: string | null;
  cpv_codes: string[];
  procedure: string | null;
  deadline_at: IsoDateTime | null;
  /** What `deadline_at` is the last day for; "tender" when left out. */
  deadline_kind?: NoticeDeadlineKind;
  url: string | null;
}

export type InterpretationState = "pending" | "retrying" | "failed";

/** A document that has no checklist yet, and where its interpretation stands. */
export interface InterpretationView {
  document_id: Uuid;
  notice_id: Uuid;
  notice_title: string;
  filename: string;
  /** failed: the worker has given up; ask for a new interpretation. */
  state: InterpretationState;
  attempts: number;
  error: string | null;
  retry_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface InsightItem {
  notice_id: Uuid;
  notice_title: string;
  /**
   * Sista anbudsdag, when the tender period ends: the notice's own deadline, or for a notice that only gives the last
   * day for anbudsansökan the published checklist's; null when nobody knows it yet.
   */
  deadline_at: IsoDateTime | null;
  question_count: number;
  not_in_document_count: number;
  formal_question_suggestions: number;
  sample_questions: string[];
  visible: boolean;
}

export interface JobRunView {
  id: Uuid;
  job: string;
  status: string;
  started_at: IsoDateTime;
  finished_at: IsoDateTime | null;
  stats: Record<string, unknown>;
  error: string | null;
}

export type JobName =
  | "ingest_ted"
  | "ingest_eavrop"
  | "ingest_lou"
  | "close_expired"
  | "interpret_pending"
  | "match_all"
  | "send_reminders"
  | "notify_matches";

export interface ErrorView {
  detail: string;
}
