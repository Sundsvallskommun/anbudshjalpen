/** What Start shows first: the company's matches in order and the next deadline among them. */
import type { Fit, IsoDateTime, MatchView, NoticeSummary } from "../../api/types";
import { calendarDateOf, isPassed } from "../../lib/format";
import { noticeDeadlineReminder } from "../../lib/labels";

const FIT_ORDER: Record<Fit, number> = { passar: 0, passar_delvis: 1, passar_inte: 2 };

/**
 * An assessment's summary without the engine lead-in that older assessments were stored with ("Automatisk
 * sammanställning utan språkmodell: …"): the company's view does not use those words, and the provenance line
 * already says how the text was made (direction.md, section 9.5).
 */
export function withoutEngineLead(text: string): string {
  return text.replace(/^\s*automatisk sammanställning utan språkmodell\s*:\s*/iu, "").trim();
}

/** "Anna" for Anna Berg: Start greets the person by first name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/u)[0] ?? name;
}

/** A match worth a card: the engine thinks it fits, at least in part. */
export function isFitting(match: Pick<MatchView, "fit">): boolean {
  return match.fit !== "passar_inte";
}

/** Best fit first, then the nearest sista anbudsdag (notices without one last). */
export function sortMatches<T extends Pick<MatchView, "fit" | "notice">>(matches: readonly T[]): T[] {
  return [...matches].sort(
    (a, b) =>
      FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
      (a.notice.deadline_at ?? "9999").localeCompare(b.notice.deadline_at ?? "9999"),
  );
}

export type DeadlineKind = "fragestopp" | "sista_anbudsdag" | "anbudsansokan";

/** One deadline of a matched notice. */
export interface DeadlineEntry {
  notice: NoticeSummary;
  fit: Fit;
  kind: DeadlineKind;
  /** The moment; frågestopp is the end of its day (a date: show it as one). */
  at: IsoDateTime;
}

/**
 * The notice's deadlines that have not passed: sista dag för frågor, then the notice's own deadline (sista anbudsdag,
 * or sista dag för anbudsansökan in a restricted procedure).
 */
export function deadlinesOf(match: Pick<MatchView, "notice" | "fit">, now: Date = new Date()): DeadlineEntry[] {
  const { notice, fit } = match;
  const entries: DeadlineEntry[] = [];
  if (notice.question_deadline) entries.push({ notice, fit, kind: "fragestopp", at: notice.question_deadline });
  if (notice.deadline_at) entries.push({ notice, fit, kind: noticeDeadlineReminder(notice), at: notice.deadline_at });
  return entries.filter((entry) => !isPassed(entry.at, now));
}

function compareDeadlines(a: DeadlineEntry, b: DeadlineEntry): number {
  // By day first: on the same day the better fit leads, then the earlier moment.
  return (
    calendarDateOf(a.at).localeCompare(calendarDateOf(b.at)) ||
    FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
    Date.parse(a.at) - Date.parse(b.at)
  );
}

export interface NextDeadlines {
  next: DeadlineEntry;
  /** The same notice's following deadline ("Därefter: Sista anbudsdag 9 nov"), if it has one. */
  then: DeadlineEntry | null;
}

/** The nearest deadline among the matches that fit, and what follows it for the same notice. */
export function nextDeadlines(matches: readonly MatchView[], now: Date = new Date()): NextDeadlines | null {
  const entries = matches
    .filter(isFitting)
    .flatMap((match) => deadlinesOf(match, now))
    .sort(compareDeadlines);
  const next = entries[0];
  if (!next) return null;
  const then = entries.find((entry) => entry.notice.id === next.notice.id && entry.kind !== next.kind) ?? null;
  return { next, then };
}
