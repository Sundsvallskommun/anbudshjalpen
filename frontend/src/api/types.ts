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

export interface NoticeSummary {
  id: Uuid;
  title: string;
  buyer: string | null;
  source: string;
  status: NoticeStatus;
  published_at: IsoDateTime | null;
  deadline_at: IsoDateTime | null;
  cpv_codes: string[];
  has_documents: boolean;
  checklist_status: ChecklistStatus;
  is_fictitious: boolean;
  fit: Fit | null;
}

export interface NoticeList {
  items: NoticeSummary[];
  total: number;
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
  created_at: IsoDateTime;
}

export interface NoticeDetail extends NoticeSummary {
  description: string | null;
  procedure: string | null;
  url: string | null;
  documents_url: string | null;
  place: string | null;
  estimated_value_sek: number | null;
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

export type ReminderKind = "fragestopp" | "sista_anbudsdag" | "egen";

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
  due_at: IsoDateTime;
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

export interface ChecklistAdminItem {
  id: Uuid;
  notice_id: Uuid;
  notice_title: string;
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
  description: string | null;
  cpv_codes: string[];
  procedure: string | null;
  deadline_at: IsoDateTime | null;
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
