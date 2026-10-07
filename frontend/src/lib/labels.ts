/**
 * Swedish words for the contract's codes. One place, so a status reads the same on every page. The words follow the
 * copy rules (direction.md, section 7): they say what the reader should do, not what the engine did, and the
 * company's view never uses "språkmodell", "verifierat", "obevisat" or "styrka".
 */
import type {
  AttachmentCheck,
  CheckStatus,
  ChecklistStatus,
  Citation,
  DateKind,
  Fit,
  JobName,
  MatchReason,
  NoticeDeadlineKind,
  NoticeStatus,
  NoticeSummary,
  ReminderKind,
  RequirementKind,
  VerificationSummary,
} from "../api/types";
import { formatNumber } from "./format";

export const NOTICE_STATUS: Record<NoticeStatus, string> = {
  open: "Öppen för anbud",
  planned: "Planerad",
  closed: "Stängd",
  awarded: "Tilldelad",
};

export const CHECKLIST_STATUS: Record<ChecklistStatus, string> = {
  none: "Ingen checklista",
  draft: "Utkast",
  approved: "Godkänd",
  published: "Publicerad",
  rejected: "Avvisad",
};

/** The engine compares CPV codes and words, not the requirements, so a fit "seems" right: never a green "Passar". */
export const FIT: Record<Fit, string> = {
  passar: "Verkar passa",
  passar_delvis: "Passar delvis",
  passar_inte: "Verkar inte passa",
};

/** The token on a notice with a published checklist ("Checklista finns" before the redesign). */
export const PUBLISHED_CHECKLIST = "Granskad checklista";

export const REQUIREMENT_KINDS: { kind: RequirementKind; label: string; description: string }[] = [
  {
    kind: "skallkrav",
    label: "Skallkrav",
    description: "Måste vara uppfyllda. Annars kan anbudet inte antas.",
  },
  {
    kind: "kvalificeringskrav",
    label: "Kvalificeringskrav",
    description: "Krav på företaget, till exempel registrering, ekonomi, försäkringar och tidigare uppdrag.",
  },
  {
    kind: "krav_pa_uppdraget",
    label: "Krav på uppdraget",
    description: "Vad som ska levereras och hur arbetet ska utföras.",
  },
  {
    kind: "avtalsvillkor",
    label: "Avtalsvillkor",
    description: "Villkor som gäller när avtalet har tecknats.",
  },
];

export const DATE_KIND: Record<DateKind, string> = {
  fragestopp: "Sista dag för frågor",
  sista_anbudsdag: "Sista anbudsdag",
  anbudets_giltighet: "Anbudets giltighetstid",
  tilldelning: "Planerat tilldelningsbeslut",
  avtalsstart: "Avtalsstart",
  annat: "Datum",
};

/**
 * A draft review's verdict per requirement. The rule-based engine looks for words, so "saknas" becomes "Hittades
 * inte": it claims no more than the engine knows.
 */
export const CHECK_STATUS: Record<CheckStatus, string> = {
  uppfyllt: "Ser bra ut",
  obevisat: "Bevis saknas",
  saknas: "Hittades inte",
  oklart: "Kontrollera själv",
};

/** The review's groups, by what the reader does first (direction.md, section 2). */
export const CHECK_GROUP: Record<CheckStatus, string> = {
  saknas: "Måste åtgärdas",
  obevisat: "Måste åtgärdas",
  oklart: "Kontrollera själv",
  uppfyllt: "Ser bra ut",
};

export const ATTACHMENT_STATUS: Record<AttachmentCheck["status"], string> = {
  bifogad: "Bifogad",
  saknas: "Hittades inte",
  oklart: "Kontrollera själv",
};

/** A fit reason's kind as a short lead-in on its row ("Kontrollera själv: …"). */
export const REASON_KIND: Record<MatchReason["kind"], string> = {
  styrka: "Talar för",
  hinder: "Kan stoppa er",
  oklart: "Kontrollera själv",
};

/** A heading over the reasons of one kind. */
export const REASON_HEADING: Record<MatchReason["kind"], string> = {
  styrka: "Därför verkar den passa",
  hinder: "Det här kan stoppa er",
  oklart: "Kontrollera själv",
};

export const REMINDER_KIND: Record<ReminderKind, string> = {
  fragestopp: "Sista dag för frågor",
  sista_anbudsdag: "Sista anbudsdag",
  anbudsansokan: "Sista dag för anbudsansökan",
  egen: "Egen påminnelse",
};

/** A deadline a reminder follows, as running text names it ("Påminn mig före sista anbudsdag …"). */
export const REMINDER_SUBJECT: Record<Exclude<ReminderKind, "egen">, string> = {
  fragestopp: "sista dag för frågor",
  sista_anbudsdag: "sista anbudsdag",
  anbudsansokan: "sista dag för anbudsansökan",
};

/** The reminder that follows a notice's own deadline: sista anbudsdag, or anbudsansökan in a restricted procedure. */
export function noticeDeadlineReminder(notice: Pick<NoticeSummary, "deadline_kind">): "sista_anbudsdag" | "anbudsansokan" {
  return notice.deadline_kind === "request" ? "anbudsansokan" : "sista_anbudsdag";
}

/** What a notice's own deadline is called: "Sista anbudsdag", or "Sista dag för anbudsansökan" (`deadline_kind`). */
export function noticeDeadlineLabel(notice: Pick<NoticeSummary, "deadline_kind">): string {
  return REMINDER_KIND[noticeDeadlineReminder(notice)];
}

/**
 * The word a list row shows above a deadline that is not sista anbudsdag, where the row has no room for the label.
 * Null for sista anbudsdag, which every list row is read as.
 */
export function noticeDeadlineNote(kind: NoticeDeadlineKind): string | null {
  return kind === "request" ? "Anbudsansökan" : null;
}

export const JOBS: { job: JobName; label: string; description: string }[] = [
  { job: "ingest_ted", label: "Hämta annonser från TED", description: "Annonser från EU:s annonsdatabas." },
  { job: "ingest_eavrop", label: "Hämta annonser från e-Avrop", description: "Kommunens annonser och planerade upphandlingar." },
  { job: "ingest_lou", label: "Uppdatera LOU", description: "Lagtexten från Riksdagens öppna data." },
  {
    job: "close_expired",
    label: "Stäng passerade annonser",
    description: "Stänger öppna annonser vars sista anbudsdag, eller sista dag för anbudsansökan, har passerat.",
  },
  { job: "interpret_pending", label: "Tolka nya underlag", description: "Gör checklistor av uppladdade underlag." },
  { job: "match_all", label: "Bedöm matchningar", description: "Jämför företagens profiler med upphandlingarna." },
  { job: "send_reminders", label: "Skicka påminnelser", description: "Mejlar påminnelser som har förfallit." },
  { job: "notify_matches", label: "Meddela träffar", description: "Mejlar företag om nya upphandlingar som passar dem." },
];

export const JOB_LABEL: Record<string, string> = Object.fromEntries(JOBS.map(({ job, label }) => [job, label]));

const SOURCES: Record<string, string> = {
  ted: "TED",
  eavrop: "e-Avrop",
  fixture: "Demo",
  manual: "Inlagd av inköp",
};

export function sourceLabel(source: string): string {
  return SOURCES[source] ?? source;
}

const ENGINES: Record<string, string> = {
  heuristic: "regelbaserad motor",
  eneo: "AI via Eneo",
  openai: "AI",
};

/** The engine in the reader's words, as a short noun phrase: "regelbaserad motor", "AI via Eneo" or "AI". */
export function engineLabel(engine: string): string {
  return ENGINES[engine] ?? "AI";
}

const ENGINE_SUMMARIES: Record<string, string> = {
  heuristic:
    "Motorn i demon just nu är regelbaserad: den letar efter ord och mönster i underlaget med fasta regler, utan AI-modell.",
  eneo: "Motorn i demon just nu är AI via Eneo, Sundsvalls kommuns AI-plattform.",
  openai: "Motorn i demon just nu är en AI-modell som läser underlaget som text.",
};

/** Which engine the demo runs, in one sentence ("Om demon och AI"). */
export function engineSummary(engine: string): string {
  return ENGINE_SUMMARIES[engine] ?? ENGINE_SUMMARIES.openai!;
}

/**
 * What automatic content rests on: the procurement documents (checklists, answers, fit and draft reviews) or the law
 * (Regelhjälpen's paragraphs of LOU). It decides how "Hur togs det här fram?" explains the engine and the sources.
 */
export type ProvenanceBasis = "document" | "law";

const ENGINE_DESCRIPTIONS: Record<ProvenanceBasis, Record<string, string>> = {
  document: {
    heuristic:
      "Det här togs fram regelbaserat: Anbudsklar letar efter ord och mönster i underlaget med fasta regler. Ingen AI-modell tolkar texten.",
    eneo: "Det här togs fram med AI via Eneo, Sundsvalls kommuns AI-plattform. Underlaget skickas som text till Eneo och sparas inte där efter svaret.",
    openai: "Det här togs fram med en AI-modell som läser underlaget som text.",
  },
  law: {
    heuristic:
      "Det här togs fram regelbaserat: Regelhjälpen letar upp paragrafer i lagen om offentlig upphandling (LOU) som innehåller orden i din fråga. Ingen AI-modell tolkar frågan.",
    eneo: "Svaret togs fram med AI via Eneo, Sundsvalls kommuns AI-plattform, utifrån lagen om offentlig upphandling.",
    openai: "Svaret togs fram med en AI-modell utifrån lagen om offentlig upphandling.",
  },
};

/** One or two sentences on how the engine works, for "Hur togs det här fram?"; `basis` is what it worked from. */
export function engineDescription(engine: string, basis: ProvenanceBasis = "document"): string {
  const descriptions = ENGINE_DESCRIPTIONS[basis];
  return descriptions[engine] ?? descriptions.openai!;
}

/** The page a citation opens on: where verification found the quote, else the page the AI gave. */
export function citationPage(citation: Pick<Citation, "check" | "page" | "found_page">): number {
  return citation.check === "moved" && citation.found_page ? citation.found_page : citation.page;
}

/**
 * The one line per view that says how the sources held up: "Alla 86 källhänvisningar hittades i underlaget". Only
 * deviations get words: quotes found on another page than the AI gave, and quotes that were not found. Null when
 * there is nothing to check.
 */
export function verificationText(summary: VerificationSummary): string | null {
  const total = summary.citations_total;
  if (total <= 0) return null;
  const found = summary.citations_verified + summary.citations_moved;
  const moved = summary.citations_moved;
  const missing = summary.citations_unverified;
  const noun = total === 1 ? "källhänvisning" : "källhänvisningar";
  const lead =
    found === total
      ? total === 1
        ? "Källhänvisningen hittades i underlaget"
        : `Alla ${formatNumber(total)} ${noun} hittades i underlaget`
      : `${formatNumber(found)} av ${formatNumber(total)} ${noun} hittades i underlaget`;
  const parts = [lead];
  if (moved > 0) parts.push(`${formatNumber(moved)} på en annan sida än AI:n angav`);
  if (missing > 0) parts.push(`${formatNumber(missing)} hittades inte och behöver kontrolleras`);
  return parts.join(" · ");
}

/** The four steps of a notice page, in order, with the values `?flik=` has always used. */
export const STEPS = [
  { value: "checklista", label: "Krav", number: 1 },
  { value: "fraga", label: "Fråga", number: 2 },
  { value: "granska", label: "Granska", number: 3 },
  { value: "inlamning", label: "Lämna in", number: 4 },
] as const;

export type StepValue = (typeof STEPS)[number]["value"];
