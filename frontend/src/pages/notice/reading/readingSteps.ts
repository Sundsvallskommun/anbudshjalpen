/**
 * The steps of "Så lästes underlaget" (the demo's trace), in the reader's words, from what the app already stores:
 * the reading report for the files, and the notice detail for the checklist and the published answers. Pure, so the
 * wording is tested without a page.
 */
import type {
  ChecklistView,
  DocumentReading,
  IsoDateTime,
  NoticeDetail,
  ReadingReport,
} from "../../../api/types";
import { formatBytes, formatClock, formatNumber, formatShortDate, plural } from "../../../lib/format";
import { engineLabel, verificationText } from "../../../lib/labels";
import { progressText } from "../NoChecklist";

/** Neutral is what happened; warning is something the AI never saw; good is a check that passed. */
export type StepTone = "neutral" | "warning" | "good";

export interface ReadingStep {
  /** When it happened; null for a fact without a time of its own. */
  at: IsoDateTime | null;
  text: string;
  tone: StepTone;
}

export interface ReadingGroup {
  key: string;
  title: string;
  /** Short marks after the title: "Huvuddokument", "Ersatt". */
  marks: string[];
  steps: ReadingStep[];
}

export const MAIN_MARK = "Huvuddokument";
export const REPLACED_MARK = "Ersatt";
export const NOTICE_TITLE = "Upphandlingen";
export const UNREAD_TITLE = "Filer som inte lästes in";
export const CHECKLIST_TITLE = "Checklistan";

const MINUTE_MS = 60_000;

/** "13 okt kl. 06:30"; the date alone for a moment at midnight. */
export function stepTime(at: IsoDateTime, now: Date = new Date()): string {
  return `${formatShortDate(at, "auto", now)} ${formatClock(at) ?? ""}`.trim();
}

const FORMATS: readonly [string, string][] = [
  ["application/pdf", "PDF"],
  ["wordprocessingml", "Word"],
  ["spreadsheetml", "Excel"],
  ["text/plain", "Text"],
  ["application/zip", "Zip-arkiv"],
];

/** "PDF", "Word", "Excel" or "Text" for a stored file's media type, else the type itself. */
export function formatLabel(mimetype: string): string {
  const hit = FORMATS.find(([needle]) => mimetype.includes(needle));
  return hit ? hit[1] : mimetype;
}

function step(at: IsoDateTime | null, text: string, tone: StepTone = "neutral"): ReadingStep {
  return { at, text, tone };
}

/** The steps in the order they happened; a fact without a time of its own comes after them, in the order given. */
function ordered(steps: ReadingStep[]): ReadingStep[] {
  const timed = steps.filter((candidate) => candidate.at !== null);
  const facts = steps.filter((candidate) => candidate.at === null);
  return [...timed.sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime()), ...facts];
}

function fetchedText(source: string): string {
  switch (source) {
    case "eavrop":
      return "Annonsen hämtades från e-Avrop";
    case "ted":
      return "Annonsen hämtades från TED";
    case "fixture":
      return "Påhittad upphandling, inlagd som demodata";
    case "manual":
      return "Annonsen lades in av inköp";
    default:
      return `Annonsen hämtades från ${source}`;
  }
}

function noticeGroup(report: ReadingReport): ReadingGroup {
  const steps = [step(report.fetched_at, fetchedText(report.source))];
  const fetched = new Date(report.fetched_at).getTime();
  const updated = new Date(report.updated_at).getTime();
  if (updated - fetched >= MINUTE_MS) steps.push(step(report.updated_at, "Uppgifterna uppdaterades senast från källan"));
  return { key: "notice", title: NOTICE_TITLE, marks: [], steps };
}

function storedText(document: DocumentReading): string {
  switch (document.origin) {
    case "eavrop":
      return "Hämtades från e-Avrop";
    case "upload":
      return "Laddades upp av inköp";
    case "archive":
      return `Packades upp ur ${document.archive ?? "arkivet"}`;
    case "fixture":
      return "Lades in som demodata";
    default:
      return "Lades in av inköp";
  }
}

function extractionSteps(document: DocumentReading, report: ReadingReport): ReadingStep[] {
  const steps: ReadingStep[] = [];
  if (document.page_count <= 0 || document.characters <= 0) {
    steps.push(step(document.stored_at, "Ingen text kunde tas ut ur filen", "warning"));
  } else {
    const amount = `${plural(document.page_count, "sida", "sidor")}, ${formatNumber(document.characters)} tecken`;
    steps.push(step(document.stored_at, `Texten togs ut (textuttag version ${document.extraction_version}): ${amount}`));
  }
  if (document.extraction_version < report.extraction_version) {
    steps.push(
      step(
        null,
        `Läst med en äldre version av textuttaget (${document.extraction_version}, nu ${report.extraction_version}). Läses om automatiskt`,
        "warning",
      ),
    );
  }
  if (document.layout === "eavrop") {
    steps.push(
      step(
        document.stored_at,
        "Kändes igen som en export ur e-Avrop: sidfoten togs bort från varje sida, och formulärfälten (Ja, Svar, Kommentar, Ingen fil bifogad) räknas inte som text i underlaget",
        "good",
      ),
    );
  }
  if (document.empty_pages > 0 && document.page_count > 0) {
    const text =
      document.empty_pages >= document.page_count
        ? "Ingen läsbar text på någon sida, troligen inskannad. AI:n såg inget av filen"
        : `${plural(document.empty_pages, "sida", "sidor")} utan läsbar text, troligen inskannade. AI:n såg dem inte`;
    steps.push(step(null, text, "warning"));
  }
  return steps;
}

function roleSteps(document: DocumentReading, report: ReadingReport): ReadingStep[] {
  const steps: ReadingStep[] = [];
  const budget = `${formatNumber(report.budget_chars)} tecken`;
  if (document.is_main) {
    steps.push(step(null, "Huvuddokument: tolkas till checklistan, tillsammans med de övriga dokumenten"));
    if (document.characters > report.budget_chars) {
      steps.push(
        step(null, `Större än en tolkning rymmer (${budget}). Ingen checklista förrän underlaget delas upp`, "warning"),
      );
    }
  } else {
    steps.push(step(null, "Bilaga: läses med i tolkningen, i Fråga AI och i sökningen"));
    if (document.characters > report.budget_chars) {
      steps.push(step(null, `Större än en tolkning rymmer (${budget}): bara en del av filen läses åt gången`, "warning"));
    }
  }
  return steps;
}

function replacedStep(document: DocumentReading, report: ReadingReport): ReadingStep {
  const successor = report.documents.find((candidate) => candidate.id === document.superseded_by);
  const by =
    !successor || successor.filename === document.filename
      ? "Ersattes av en nyare fil med samma namn från källan"
      : `Ersattes av ”${successor.filename}” från källan`;
  return step(document.superseded_at, `${by}. Den här versionen läses inte längre, men gamla källhänvisningar fungerar`);
}

function documentGroup(document: DocumentReading, report: ReadingReport): ReadingGroup {
  const replaced = document.superseded_by !== null;
  const marks = [document.is_main ? MAIN_MARK : null, replaced ? REPLACED_MARK : null].filter(
    (mark): mark is string => mark !== null,
  );
  const stored = `${storedText(document)} · ${formatLabel(document.mimetype)}, ${formatBytes(document.size_bytes)}`;
  const steps = [step(document.stored_at, stored), ...extractionSteps(document, report)];
  if (replaced) steps.push(replacedStep(document, report));
  else steps.push(...roleSteps(document, report));
  return { key: document.id, title: document.filename, marks, steps: ordered(steps) };
}

function unreadGroup(report: ReadingReport): ReadingGroup | null {
  if (report.unread_files.length === 0) return null;
  return {
    key: "unread",
    title: UNREAD_TITLE,
    marks: [],
    steps: report.unread_files.map((file) => step(null, `${file.filename} · ${file.reason}`, "warning")),
  };
}

const UNPUBLISHED: Record<string, string> = {
  draft: "Utkast som väntar på inköps granskning",
  approved: "Godkänd av inköp, inte publicerad än",
  rejected: "Avvisad av inköp",
};

function checklistSteps(view: ChecklistView): ReadingStep[] {
  const engine = view.model ? `${engineLabel(view.engine)}, ${view.model}` : engineLabel(view.engine);
  const steps = [step(view.created_at, `Tolkades till ett utkast till checklista (${engine})`)];
  const read = view.verification.read;
  if (read) {
    const all = read.documents_read === read.documents_total && read.pages_read === read.pages_total;
    const text = `Tolkningen läste ${read.documents_read} av ${read.documents_total} dokument och ${read.pages_read} av ${read.pages_total} sidor`;
    steps.push(step(view.created_at, all ? text : `${text}. Resten rymdes inte`, all ? "good" : "warning"));
  }
  const sources = verificationText(view.verification);
  if (sources) steps.push(step(view.created_at, sources, view.verification.citations_unverified > 0 ? "warning" : "good"));
  if (view.approved_at) steps.push(step(view.approved_at, "Granskades och godkändes av inköp", "good"));
  if (view.published_at) {
    steps.push(step(view.published_at, view.reviewed ? "Publicerades för företagen" : "Publicerades utan inköps granskning"));
  } else {
    const state = UNPUBLISHED[view.status];
    if (state) steps.push(step(null, state));
  }
  return steps;
}

function answersStep(notice: NoticeDetail): ReadingStep | null {
  const answers = notice.published_answers;
  if (answers.length === 0) return null;
  const latest = answers.map((answer) => answer.answered_at).sort().at(-1) ?? null;
  return step(
    latest,
    `${plural(answers.length, "svar", "svar")} från inköp hämtade från e-Avrop. Ändras svaren tolkas checklistan om`,
  );
}

function checklistGroup(notice: NoticeDetail, now: Date): ReadingGroup {
  const steps: ReadingStep[] = [];
  if (notice.checklist) steps.push(...checklistSteps(notice.checklist));
  else if (notice.checklist_progress) steps.push(step(null, progressText(notice.checklist_progress, now)));
  else steps.push(step(null, "Ingen checklista visas för den här upphandlingen ännu"));
  const answers = answersStep(notice);
  if (answers) steps.push(answers);
  return { key: "checklist", title: CHECKLIST_TITLE, marks: [], steps: ordered(steps) };
}

/** The whole trace, group by group: the notice, every file oldest first, the unread files and the checklist. */
export function readingGroups(report: ReadingReport, notice: NoticeDetail, now: Date = new Date()): ReadingGroup[] {
  const groups = [noticeGroup(report), ...report.documents.map((document) => documentGroup(document, report))];
  const unread = unreadGroup(report);
  if (unread) groups.push(unread);
  groups.push(checklistGroup(notice, now));
  return groups;
}
