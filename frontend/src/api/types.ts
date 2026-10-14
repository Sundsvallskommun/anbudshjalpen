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
  /** The document's name as the model saw it, when the material had several documents. */
  document: string | null;
  /** Set by verification: the document where the quote was found. */
  document_id: Uuid | null;
}

/** A quote from one of inköp's published answers in e-Avrop (decision 0018). */
export interface AnswerCitation {
  /** The answer's number as the model saw it, "[SVAR n]": oldest first, as the page numbers them. */
  answer: number;
  quote: string;
  check: CitationCheck | null;
  /** Set by verification: the answer that holds the quote, when it differs. */
  found_answer: number | null;
  /** Set by verification: the stable key of that answer, `PublishedAnswerView.key`. */
  answer_key: string | null;
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
  /** A published answer that changes or clarifies the requirement (decision 0018). */
  answer_citation?: AnswerCitation | null;
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
  /** Quotes from inköp's published answers, which go before the documents where they differ (decision 0018). */
  answer_citations: AnswerCitation[];
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

/** A section of the law (LOU), or of one of the municipality's steering documents (decision 0022). */
export type RuleSourceKind = "law" | "policy";

export interface RuleSource {
  title: string;
  /** "LOU 20 kap. 1 §" or "Inköpsstrategin 5.2". */
  reference: string | null;
  url: string | null;
  /**
   * The start of the source's own text, cut after a whole sentence and ending with " …" when shortened. Set by the
   * backend from its own copy of LOU or the steering document (never by a model); null for sources it does not hold.
   */
  excerpt: string | null;
  /** Set by the backend; null for guidance and web pages. */
  kind: RuleSourceKind | null;
  /** Set by the backend for a steering document: "Kommunens styrdokument, fastställt av kommunfullmäktige 2023-09-25." */
  note: string | null;
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

/** When a lab company is deleted (decision 0010). */
export interface LabInfo {
  expires_at: string;
}

/** A lab company the login page offers to continue as. */
export interface LabCompanyRef {
  id: Uuid;
  name: string;
}

export interface UserView {
  id: Uuid;
  name: string;
  email: string;
  role: Role;
  company: CompanyRef | null;
  /** Set for a lab company's participant. */
  lab: LabInfo | null;
}

export interface Persona {
  key: Role;
  label: string;
  description: string;
}

export interface SessionView {
  user: UserView | null;
  personas: Persona[];
  /** Lab companies to continue as (decision 0010); empty when the lab is off. */
  lab_companies: LabCompanyRef[];
}

export interface LoginRequest {
  persona: Role;
}

export interface GateRequest {
  code: string;
}

export interface LabCreateRequest {
  name: string;
}

export interface LabLoginRequest {
  company_id: Uuid;
}

export interface AppConfig {
  organization_name: string;
  ai_engine: string;
  ai_disclosure: string;
  demo_notice: string;
  /** The municipality's page in e-Avrop, for notices without a page of their own. */
  eavrop_url: string;
  /** The service wants its access code before anything else is shown (decision 0010). */
  gate_required: boolean;
  /** The login page offers "Prova med ditt eget företag" (decision 0010). */
  lab_enabled: boolean;
  /** Inköp reviews checklists before companies see them (decisions 0011 and 0017). */
  review_required: boolean;
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
   * Frågestopp as the end of that day in Swedish time (like AnswerView.question_deadline): the source's own date
   * (e-Avrop) when it gives one, else the published checklist's. A date, so show it as one. Null when neither names it.
   */
  question_deadline: IsoDateTime | null;
  cpv_codes: string[];
  /** The Swedish label of the main (first) CPV code, e.g. "Målning"; null when the code is not in the CPV list. */
  cpv_label: string | null;
  has_documents: boolean;
  checklist_status: ChecklistStatus;
  /** The published checklist was approved by inköp; false when published without review (decision 0011). */
  checklist_reviewed: boolean;
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
  /** Pages without readable text (scans, images): what the AI never saw, so the reader checks those in the file. */
  empty_pages: number;
  is_fictitious: boolean;
}

/**
 * A file the source lists for the procurement that Anbudshjälpen could not read in (decision 0020): the reader is
 * told it exists and why it is missing here, so the documents shown are never taken for the whole set.
 */
export interface UnreadFile {
  filename: string;
  /** Swedish, as the ingestion wrote it: the format, the size or an unreadable file. */
  reason: string;
}

/** How a stored file got here: fetched from e-Avrop, uploaded by inköp, unpacked from an archive, demo data, or by hand. */
export type DocumentOrigin = "eavrop" | "upload" | "archive" | "fixture" | "manual";

/**
 * How one stored file was read in, for "Så lästes underlaget" (the demo's trace). Every value is something the app
 * already keeps about the file; nothing is logged for the trace. Replaced versions are included.
 */
export interface DocumentReading {
  id: Uuid;
  filename: string;
  origin: DocumentOrigin;
  /** The archive the file was unpacked from, when origin is "archive". */
  archive: string | null;
  mimetype: string;
  size_bytes: number;
  /** When the file was fetched, uploaded or unpacked. */
  stored_at: IsoDateTime;
  page_count: number;
  empty_pages: number;
  /** The text of all pages: what the engines and the search read. */
  characters: number;
  /** "eavrop" for an export from e-Avrop's forms, whose footer was stripped (decision 0020); null otherwise. */
  layout: string | null;
  /** The text extraction that made the pages. */
  extraction_version: number;
  /** The document the worker interprets to a checklist on its own. */
  is_main: boolean;
  /** The newer file that took over, when the source replaced it. */
  superseded_by: Uuid | null;
  /** When that newer file was stored. */
  superseded_at: IsoDateTime | null;
}

/** What happened to a notice's files, as the demo panel "Så lästes underlaget" shows it. */
export interface ReadingReport {
  notice_id: Uuid;
  source: string;
  /** When the notice was first stored. */
  fetched_at: IsoDateTime;
  /** When the source last changed it. */
  updated_at: IsoDateTime;
  /** Every stored file, oldest first, replaced ones included. */
  documents: DocumentReading[];
  unread_files: UnreadFile[];
  /** What one interpretation or answer may be given at most (decision 0012). */
  budget_chars: number;
  /** The extraction the app runs now; an older document is read again. */
  extraction_version: number;
}

/** What the engine was given (decision 0012), so the app can say so. */
export interface ReadSummary {
  documents_read: number;
  documents_total: number;
  pages_read: number;
  pages_total: number;
}

export interface VerificationSummary {
  citations_total: number;
  citations_verified: number;
  citations_moved: number;
  citations_unverified: number;
  /** What the interpretation read (decision 0020); null on checklists made before it. */
  read?: ReadSummary | null;
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
  /** Inköp approved it. False for a checklist published without review (decision 0011). */
  reviewed: boolean;
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

/**
 * A question a supplier asked in e-Avrop and the answer the buyer published there (decision 0013). Public for every
 * supplier, and never says who asked. `asked_at` is null when the source's log gave no time for the question.
 */
export interface PublishedAnswerView {
  /** "eavrop" */
  source: string;
  /** Stable across reads; an `AnswerCitation` names it. */
  key: string;
  question: string;
  answer: string;
  asked_at: IsoDateTime | null;
  answered_at: IsoDateTime;
}

export type ChecklistProgressState = "queued" | "running" | "retrying";

/** Where a checklist on its way is (decision 0019): what the notice page says instead of a bare spinner. */
export interface ChecklistProgress {
  /** Waiting for the worker's next run, being interpreted right now, or tried again after a failure. */
  state: ChecklistProgressState;
  /** Failed attempts so far, of `max_attempts` before the worker gives up. */
  attempts: number;
  max_attempts: number;
  /** The earliest next attempt after a failure. */
  retry_at: IsoDateTime | null;
  /** When the worker's next run is due, from its last start and its interval; null when it has not run lately. */
  next_run_at: IsoDateTime | null;
  /** When the interpretation job last started. */
  last_run_at: IsoDateTime | null;
}

export interface NoticeDetail extends NoticeSummary {
  description: string | null;
  procedure: string | null;
  url: string | null;
  documents_url: string | null;
  /** TED's notice of a procurement from e-Avrop that also went to TED; e-Avrop's notice is the one shown. */
  ted_url?: string | null;
  place: string | null;
  estimated_value_sek: number | null;
  /** CPV code -> Swedish label, for the codes in `cpv_codes` that are in the CPV list. */
  cpv_labels: Record<string, string>;
  /** The current documents; a file the source replaced is left out. */
  documents: DocumentInfo[];
  /** Files the source lists that were not read in, so the list above is never taken for all of them. */
  unread_files: UnreadFile[];
  checklist: ChecklistView | null;
  /** Where a checklist on its way is; null when none is coming, so the page never promises one (decision 0019). */
  checklist_progress: ChecklistProgress | null;
  match: MatchView | null;
  /** The buyer's published answers to suppliers' questions, oldest answer first, as e-Avrop numbers them. */
  published_answers: PublishedAnswerView[];
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

/**
 * What one answer cost: tokens as the model provider counted them, and money when a price is set. Null on a view
 * when the engine reported no counts (the rule-based engine has no model; Eneo's counts are not read yet).
 */
export interface TokenUsageView {
  input_tokens: number;
  output_tokens: number;
  /** Null until the operator sets both prices (AI_PRICE_INPUT_SEK_PER_MILLION and the output price). */
  cost_sek: number | null;
}

export interface AnswerView {
  answer: Answer;
  engine: string;
  /** Always sent by the backend; an answer kept in the browser from before the field existed has none. */
  usage?: TokenUsageView | null;
  /** The main document; a citation's own document_id says where its quote is. */
  document_id: Uuid;
  read: ReadSummary;
  /** Frågestopp as the end of that day in Stockholm: the source's date, else the published checklist's. A date. */
  question_deadline: IsoDateTime | null;
  /** Where to ask formally: the procurement in e-Avrop, else e-Avrop itself. */
  formal_question_url: string;
}

export interface ReviewView {
  result: ReviewResult;
  requirement_titles: Record<string, string>;
  engine: string;
  usage?: TokenUsageView | null;
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
  /** Every CPV division ("45000000" → "Anläggningsarbete"), so the chosen codes can be grouped by area. */
  cpv_divisions: Record<string, string>;
  municipalities: string[];
  employees: number | null;
  annual_turnover_sek: number | null;
  certifications: string[];
  insurance: string | null;
  public_references: string | null;
  is_fictitious: boolean;
}

/**
 * GET /api/matches/status: true from a profile save with a language model until the re-assessment after the answer
 * is done, so Start can say that the engine is working instead of "Inga nya träffar". The worker's scheduled run is
 * not seen here.
 */
export interface MatchingStatus {
  is_assessing: boolean;
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
  /** The sum of the two calls behind the suggestions. */
  usage?: TokenUsageView | null;
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
  /** Always sent by the backend; a conversation kept in the browser from before the field existed has none. */
  usage?: TokenUsageView | null;
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

/** A job inköp is considering (decision 0023), described as a notice would be: words and CPV codes. */
export interface SupplierSearch {
  title: string;
  description: string;
  cpv_codes: string[];
}

/**
 * How close the company's nearest CPV code is to the job's: the same code, a code in the same category (five
 * significant digits) or one in the same group (three), the level matching starts at.
 */
export type SupplierCpvKind = "same_code" | "same_category" | "same_group";

export interface SupplierCpvMatch {
  company_code: string;
  /** The company code's Swedish label, when the code is in the CPV list. */
  label: string | null;
  kind: SupplierCpvKind;
}

/**
 * A company that seems able to answer the job. Only what the matching itself reads: never the description, the
 * turnover, the insurance or the references.
 */
export interface SupplierMatch {
  company_id: Uuid;
  name: string;
  is_fictitious: boolean;
  /** A workshop participant's own company (decision 0010). */
  is_lab: boolean;
  municipalities: string[];
  employees: number | null;
  cpv_codes: string[];
  cpv_labels: Record<string, string>;
  /** Null when the company got in on its words alone. */
  cpv_match: SupplierCpvMatch | null;
  /** Words of the company's own description that the job's text also has, in the company's order. */
  shared_words: string[];
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

/** One AI task's calls in the period, in the tasks' own order (tolka_underlag first, regelhjalpen last). */
export interface AiUsageTaskView {
  task: string;
  calls: number;
  /** Calls whose tokens the engine reported; the token sums cover only these. */
  calls_with_usage: number;
  input_tokens: number;
  output_tokens: number;
  cost_sek: number | null;
}

/** One engine and model's calls in the period, the most used first. */
export interface AiUsageModelView {
  engine: string;
  model: string | null;
  calls: number;
  calls_with_usage: number;
  input_tokens: number;
  output_tokens: number;
  cost_sek: number | null;
}

/**
 * The AI engine's usage over the last `days` days (Drift): calls, tokens and the estimated cost. The cost is null
 * until the operator sets both prices, which the view echoes so the page can say so.
 */
export interface AiUsageView {
  since: IsoDateTime;
  until: IsoDateTime;
  days: number;
  calls: number;
  calls_with_usage: number;
  input_tokens: number;
  output_tokens: number;
  cost_sek: number | null;
  price_input_sek_per_million: number | null;
  price_output_sek_per_million: number | null;
  by_task: AiUsageTaskView[];
  by_model: AiUsageModelView[];
}

/** Settings inköp changes at run time (decision 0011). */
export interface AppSettingsView {
  /** Inköp reviews checklists before companies see them. */
  review_required: boolean;
}

export interface AppSettingsUpdate {
  review_required: boolean;
}

export interface AppSettingsSaved extends AppSettingsView {
  /** Checklists published because the review was turned off. */
  published_now: number;
}

export type JobName =
  | "ingest_ted"
  | "ingest_eavrop"
  | "ingest_lou"
  | "close_expired"
  | "interpret_pending"
  | "reextract_outdated"
  | "match_all"
  | "send_reminders"
  | "notify_matches"
  | "purge_lab";

export interface ErrorView {
  detail: string;
}
