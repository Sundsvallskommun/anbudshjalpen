/**
 * "Företagens frågor" (direction.md, section 4): the share of questions the document did not answer, and when the
 * questions themselves become visible. Pure functions, tested without rendering.
 */
import { calendarDateOf, formatShortDate, isDateOnly } from "../../lib/format";

const clockFormat = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Stockholm",
});

/** The share as a whole percentage ("33"), or null when there is nothing to divide. */
export function percentOf(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}

/** The calendar day after a "YYYY-MM-DD" date. */
function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * When the questions are shown (they are hidden while the tender runs, so that nothing can favour one supplier): from
 * the deadline's moment, "Visas från 9 nov kl. 12:00"; from the next day for a deadline at the end of a day ("Visas
 * från 10 nov" for 9 nov kl. 23:59); and from the day itself for one at midnight.
 */
export function visibleFromText(deadline: string | null, now: Date = new Date()): string {
  if (!deadline) return "Visas när sista anbudsdag har passerat";
  const day = calendarDateOf(deadline);
  if (isDateOnly(deadline)) return `Visas från ${formatShortDate(nextDay(day), "auto", now)}`;
  const time = clockFormat.format(new Date(deadline));
  if (time === "23:59") return `Visas från ${formatShortDate(nextDay(day), "auto", now)}`;
  if (time === "00:00") return `Visas från ${formatShortDate(day, "auto", now)}`;
  return `Visas från ${formatShortDate(day, "auto", now)} kl. ${time}`;
}
