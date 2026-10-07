/**
 * The reminders page's facts (direction.md, section 4 "Påminnelser" and section 7): the deadline and the e-mail as
 * two facts, never one mixed up with the other ("Sista anbudsdag 9 nov kl. 23:59 · Mejlas 7 nov kl. 08:00"), and the
 * state in the reader's words ("Skickas om 33 dagar", "Skickad 7 nov"). Pure functions with an explicit "now".
 */
import type { MatchView, ReminderView } from "../../api/types";
import type { DeadlineReminderKind } from "../../components/ui/ReminderState";
import { calendarDateOf, formatClock, formatLongDate, formatShortDate, isPassed, relativeDays } from "../../lib/format";
import { noticeDeadlineReminder, REMINDER_SUBJECT } from "../../lib/labels";

const weekdayFormat = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "Europe/Stockholm" });

/** "fredag 7 november kl. 08:00": when the e-mail goes, with the weekday, as running text writes a date. */
export function mailTime(dueAt: string, now: Date = new Date()): string {
  const clock = formatClock(dueAt);
  return `${weekdayFormat.format(new Date(dueAt))} ${formatLongDate(dueAt, "auto", now)}${clock ? ` ${clock}` : ""}`;
}

export interface SendState {
  /** Sent: "Skickad 7 nov". Coming: when, beside the time it goes ("om 33 dagar", "i morgon", "inom kort"). */
  label: string;
  isSent: boolean;
}

/**
 * The e-mail's state in the reader's words (direction.md, section 7): "Mejlas fredag 7 november kl. 08:00 · om 33
 * dagar" for one that is coming, "Skickad 7 nov" for one that went ("Väntar" and "Skickad" before the redesign). A
 * reminder past its time but not yet sent goes with the worker's next run: "inom kort".
 */
export function sendState(reminder: Pick<ReminderView, "due_at" | "sent_at">, now: Date = new Date()): SendState {
  if (reminder.sent_at) return { label: `Skickad ${formatShortDate(reminder.sent_at, "auto", now)}`, isSent: true };
  const relative = relativeDays(reminder.due_at, now);
  return { label: relative === "passerat" ? "inom kort" : relative, isSent: false };
}

/** Coming reminders in the order they are sent; sent ones newest first. */
export function splitReminders(reminders: readonly ReminderView[]): { upcoming: ReminderView[]; sent: ReminderView[] } {
  const upcoming = reminders.filter((reminder) => !reminder.sent_at).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const sent = reminders
    .filter((reminder) => reminder.sent_at)
    .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  return { upcoming, sent };
}

/** A deadline among the company's matches that a reminder could be set for, on the empty page. */
export interface DeadlineSuggestion {
  noticeId: string;
  title: string;
  kind: DeadlineReminderKind;
  /** The deadline as the notice gives it (a timestamp, or the end of a day for frågestopp). */
  deadline: string;
  /** Its calendar date, which the reminder is planned from. */
  date: string;
}

/**
 * The nearest deadlines still ahead in the matches that seem to fit, frågestopp and sista anbudsdag alike: the cards
 * Start shows, not the matches that do not seem to fit.
 */
export function deadlineSuggestions(matches: readonly MatchView[], now: Date = new Date(), limit = 3): DeadlineSuggestion[] {
  const found: DeadlineSuggestion[] = [];
  for (const { notice, fit } of matches) {
    if (fit === "passar_inte") continue;
    const candidates: [DeadlineReminderKind, string | null][] = [
      ["fragestopp", notice.question_deadline],
      [noticeDeadlineReminder(notice), notice.deadline_at],
    ];
    for (const [kind, deadline] of candidates) {
      if (!deadline || isPassed(deadline, now)) continue;
      found.push({ noticeId: notice.id, title: notice.title, kind, deadline, date: calendarDateOf(deadline) });
    }
  }
  return found.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline)).slice(0, limit);
}

/** What a deadline is called in running text, for the reminder button's name ("Påminn mig före sista anbudsdag …"). */
export const DEADLINE_SUBJECT: Record<DeadlineReminderKind, string> = REMINDER_SUBJECT;
