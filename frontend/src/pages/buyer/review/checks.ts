/**
 * The automatic checks over a checklist under review (direction.md, section 4 "Automatiska kontroller som länkar till
 * sina rader"): sista anbudsdag against the notice, missing evaluation criteria, requirement kinds against the section
 * headings, sources to look at, and a summary still in the engine's words. Each check says what it found and what the
 * buyer can do; the same findings flag the rows ("Flaggade"). Pure functions, tested without rendering.
 */
import type { AnswerCitation, Checklist, DateKind, NoticeDeadlineKind, RequirementKind } from "../../../api/types";
import { calendarDateOf, formatLongDate, formatNumber } from "../../../lib/format";
import { keyDateIndex } from "../../../lib/keyDates";
import { REQUIREMENT_KINDS } from "../../../lib/labels";
import type { ReviewRow, RowSection } from "./rows";
import { headingNoun, kindMismatch, type DocumentHeading, type KindMismatch } from "./sections";

/**
 * What a check's link does: show a row, open a row's form, add an item (with the date it should have, or the page its
 * source is on), open the summary, or filter the list.
 */
export type CheckTarget =
  | { kind: "edit"; key: string }
  | { kind: "add"; section: RowSection; date?: { kind: DateKind; date: string }; page?: number }
  | { kind: "summary" }
  | { kind: "toCheck" };

export interface AutoCheck {
  id: "deadline" | "evaluation" | "kinds" | "sources" | "summary";
  tone: "ok" | "warning";
  text: string;
  action?: { label: string; target: CheckTarget };
}

export interface CheckContext {
  checklist: Checklist;
  rows: readonly ReviewRow[];
  /** The notice's deadline: sista anbudsdag, or in a restricted procedure the last day for anbudsansökan. */
  noticeDeadline: string | null;
  /** What `noticeDeadline` is (NoticeSummary.deadline_kind); sista anbudsdag when left out. */
  noticeDeadlineKind?: NoticeDeadlineKind;
  /** The section heading each requirement stands under, by requirement id, as far as the pages are known. */
  headings: ReadonlyMap<string, string>;
  /** The document's heading about evaluation, when the pages read so far have one. */
  evaluationSection?: DocumentHeading | null;
}

const KIND_LABEL = Object.fromEntries(REQUIREMENT_KINDS.map(({ kind, label }) => [kind, label])) as Record<
  RequirementKind,
  string
>;

const NEUTER_WORDS = ["Ett", "Två", "Tre", "Fyra", "Fem", "Sex", "Sju", "Åtta", "Nio", "Tio", "Elva", "Tolv"];

/**
 * A count that starts a sentence about a neuter noun ("Två krav …"), in words up to twelve as plain language asks,
 * so it is never read together with a heading's number ("Två krav under rubriken 2 Kvalificering").
 */
function countStartingSentence(count: number): string {
  return NEUTER_WORDS[count - 1] ?? formatNumber(count);
}

/**
 * The engine's own summary: the rule-based engine's fixed wording ("Underlaget har 17 sidor. Listan har …", earlier
 * with the prefix "Automatisk sammanställning utan språkmodell:"), which companies should not get as it is.
 */
const ENGINE_SUMMARY = /^(?:automatisk sammanställning utan språkmodell|underlaget har \d+ sid(?:a|or)\.\s*listan har)/iu;

/** What is wrong with the summary: in a word for its row ("Saknas", "Skriv om"), and as the check says it. */
export interface SummaryIssue {
  label: string;
  text: string;
}

/** Why the summary needs the buyer's words, or null when it does not. */
export function summaryIssue(summary: string): SummaryIssue | null {
  if (!summary.trim()) return { label: "Saknas", text: "Sammanfattningen saknas. Skriv 2–4 meningar för företagen." };
  if (ENGINE_SUMMARY.test(summary.trim())) {
    return { label: "Skriv om", text: "Sammanfattningen är skriven av motorn. Skriv om den för företagen." };
  }
  return null;
}

export function summaryProblem(summary: string): string | null {
  return summaryIssue(summary)?.text ?? null;
}

/** The row of the checklist's sista anbudsdag: its first dated entry, as the backend reads it. */
function deadlineRow(context: CheckContext): ReviewRow | undefined {
  const index = keyDateIndex(context.checklist, "sista_anbudsdag");
  return context.rows.find((row) => row.item.section === "date" && row.index === index);
}

/** The notice's deadline as a calendar day, and whether the checklist's sista anbudsdag says another day. */
function deadlineDisagreement(context: CheckContext): { notice: string; checklist: string | null } | null {
  if (!context.noticeDeadline) return null;
  const notice = calendarDateOf(context.noticeDeadline);
  const row = deadlineRow(context);
  const date = row?.item.section === "date" ? row.item.value.date : null;
  return { notice, checklist: date };
}

function deadlineCheck(context: CheckContext): AutoCheck | null {
  const dates = deadlineDisagreement(context);
  if (!dates) return null;
  if (context.noticeDeadlineKind === "request") return requestDeadlineCheck(context, dates);
  const notice = formatLongDate(dates.notice);
  if (!dates.checklist) {
    return {
      id: "deadline",
      tone: "warning",
      text: `Checklistan saknar sista anbudsdag. Annonsen anger ${notice}.`,
      action: {
        label: "Lägg till",
        target: { kind: "add", section: "date", date: { kind: "sista_anbudsdag", date: dates.notice } },
      },
    };
  }
  if (dates.checklist !== dates.notice) {
    const row = deadlineRow(context)!;
    return {
      id: "deadline",
      tone: "warning",
      text: `Sista anbudsdag i checklistan, ${formatLongDate(dates.checklist)}, stämmer inte med annonsen, ${notice}.`,
      action: { label: "Ändra", target: { kind: "edit", key: row.key } },
    };
  }
  return { id: "deadline", tone: "ok", text: `Sista anbudsdag i checklistan stämmer med annonsen: ${notice}.` };
}

/**
 * A restricted procedure's notice gives only the last day for anbudsansökan, so sista anbudsdag can only come from the
 * document. The check says so, and flags a checklist whose sista anbudsdag is that same day, which is likely the
 * request deadline read as the tender deadline.
 */
function requestDeadlineCheck(context: CheckContext, dates: { notice: string; checklist: string | null }): AutoCheck {
  const notice = formatLongDate(dates.notice);
  const request = `Annonsen anger bara sista dag för anbudsansökan, ${notice}.`;
  if (!dates.checklist) {
    return {
      id: "deadline",
      tone: "warning",
      text: `Checklistan saknar sista anbudsdag. ${request} Ta sista anbudsdag från underlaget, om det anger den.`,
    };
  }
  if (dates.checklist === dates.notice) {
    const row = deadlineRow(context)!;
    return {
      id: "deadline",
      tone: "warning",
      text: `Sista anbudsdag i checklistan är samma dag som sista dag för anbudsansökan i annonsen, ${notice}. Kontrollera att det är dagen för anbuden.`,
      action: { label: "Ändra", target: { kind: "edit", key: row.key } },
    };
  }
  return {
    id: "deadline",
    tone: "ok",
    text: `${request} Sista anbudsdag i checklistan, ${formatLongDate(dates.checklist)}, kommer från underlaget.`,
  };
}

/** A heading kept on one line with its number in a sentence ("4 Utvärdering"), as a page is with its number. */
function unbroken(text: string): string {
  return text.replace(/^(\S+)\s+/u, "$1\u00a0");
}

function evaluationCheck(context: CheckContext): AutoCheck {
  const count = context.checklist.evaluation.length;
  if (count === 0) {
    const section = context.evaluationSection ?? null;
    return {
      id: "evaluation",
      tone: "warning",
      text: section
        ? `Inga utvärderingskriterier hittades, men underlaget har ${headingNoun(section.heading)} ${unbroken(section.heading)} på sida\u00a0${section.page}.`
        : "Inga utvärderingskriterier hittades. Lägg till dem om underlaget beskriver hur anbuden utvärderas.",
      action: {
        label: "Lägg till",
        target: section ? { kind: "add", section: "evaluation", page: section.page } : { kind: "add", section: "evaluation" },
      },
    };
  }
  return {
    id: "evaluation",
    tone: "ok",
    text: `Utvärderingen finns med: ${formatNumber(count)} ${count === 1 ? "kriterium" : "kriterier"}.`,
  };
}

/** Each requirement whose kind disagrees with the heading it stands under. */
export function kindMismatches(context: CheckContext): Map<string, KindMismatch> {
  const found = new Map<string, KindMismatch>();
  for (const requirement of context.checklist.requirements) {
    const mismatch = kindMismatch(requirement.kind, context.headings.get(requirement.id) ?? null);
    if (mismatch) found.set(requirement.id, mismatch);
  }
  return found;
}

function kindsCheck(context: CheckContext): AutoCheck | null {
  const known = context.checklist.requirements.filter((requirement) => context.headings.has(requirement.id));
  if (known.length === 0) return null;
  const mismatches = kindMismatches(context);
  if (mismatches.size === 0) {
    return { id: "kinds", tone: "ok", text: "Kravtyperna stämmer med rubrikerna i underlaget." };
  }
  const wrong = context.checklist.requirements.filter((requirement) => mismatches.has(requirement.id));
  const headings = new Set([...mismatches.values()].map((mismatch) => mismatch.heading));
  const kinds = new Set(wrong.map((requirement) => requirement.kind));
  const count = countStartingSentence(mismatches.size);
  const text =
    headings.size === 1 && kinds.size === 1
      ? `${count} krav under rubriken ${unbroken([...headings][0]!)} är ${mismatches.size === 1 ? "tolkat" : "tolkade"} som ${KIND_LABEL[wrong[0]!.kind]}.`
      : `${count} krav står under en rubrik som inte stämmer med kravtypen.`;
  return { id: "kinds", tone: "warning", text, action: { label: "Visa", target: { kind: "toCheck" } } };
}

/** "a, b och c": Swedish lists join the last two with "och", the rest with commas. */
const LIST_FORMAT = new Intl.ListFormat("sv", { style: "long", type: "conjunction" });

function sourcesCheck(context: CheckContext): AutoCheck | null {
  const citations = context.rows.flatMap((row) => (row.citation ? [row.citation] : []));
  const missing = citations.filter((citation) => citation.check === "unverified").length;
  const moved = citations.filter((citation) => citation.check === "moved").length;
  // Quotes of inköp's published answers (decision 0018) are checked too, and companies see a missing one.
  const answerQuotes = context.checklist.requirements.flatMap((requirement) =>
    requirement.answer_citation ? [requirement.answer_citation] : [],
  );
  const answersOff = answerQuotes.filter((citation) => citation.check !== "verified").length;
  if (missing + moved + answersOff === 0) return null;
  const parts = [
    missing > 0 ? `${formatNumber(missing)} hittades inte` : null,
    moved > 0 ? `${formatNumber(moved)} står på en annan sida än AI:n angav` : null,
    answersOff > 0 ? `${formatNumber(answersOff)} ur inköps svar stämmer inte` : null,
  ].filter((part): part is string => part !== null);
  const total = missing + moved + answersOff;
  return {
    id: "sources",
    tone: "warning",
    text: `${formatNumber(total)} ${total === 1 ? "källhänvisning" : "källhänvisningar"} behöver kontrolleras: ${LIST_FORMAT.format(parts)}.`,
    action: { label: "Visa", target: { kind: "toCheck" } },
  };
}

function summaryCheck(context: CheckContext): AutoCheck | null {
  const problem = summaryProblem(context.checklist.summary);
  if (!problem) return null;
  return { id: "summary", tone: "warning", text: problem, action: { label: "Ändra", target: { kind: "summary" } } };
}

/** The checks, in a fixed order so each keeps its place while the buyer works. */
export function autoChecks(context: CheckContext): AutoCheck[] {
  return [
    deadlineCheck(context),
    evaluationCheck(context),
    kindsCheck(context),
    sourcesCheck(context),
    summaryCheck(context),
  ].filter((check): check is AutoCheck => check !== null);
}

/** What a row needs said under its title: the heading it disagrees with, or the notice's other deadline. */
export function rowHints(row: ReviewRow, context: CheckContext, mismatches: ReadonlyMap<string, KindMismatch>): string[] {
  if (row.item.section === "requirement") {
    const mismatch = mismatches.get(row.item.value.id);
    return [...(mismatch ? [`Står under ${mismatch.heading}`] : []), ...answerHints(row.item.value.answer_citation)];
  }
  if (row.item.section === "date" && row.key === deadlineRow(context)?.key) {
    const dates = deadlineDisagreement(context);
    if (dates?.checklist && dates.checklist !== dates.notice) return [`Annonsen anger ${formatLongDate(dates.notice)}`];
  }
  return [];
}

/** What a requirement's quote of inköp's published answer needs said (decision 0018): nothing when it was found. */
export function answerHints(citation: AnswerCitation | null | undefined): string[] {
  if (!citation || citation.check === "verified") return [];
  if (citation.check === "moved" && citation.found_answer) {
    return [`Citatet ur inköps svar står i fråga ${citation.found_answer}, inte ${citation.answer}`];
  }
  return ["Citatet ur inköps svar hittades inte"];
}

/** Whether a row belongs under "Flaggade": its source was not found or moved, or a check points at it. */
export function needsCheck(row: ReviewRow, hints: readonly string[]): boolean {
  return row.citation?.check === "unverified" || row.citation?.check === "moved" || hints.length > 0;
}
