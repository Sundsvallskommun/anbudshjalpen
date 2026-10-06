/** Upcoming procurements from the agreement catalogue, as Start and the notice list show them. */
import type { UpcomingProcurement } from "../../api/types";
import { formatLongDate, formatShortDate } from "../../lib/format";

/** How far ahead the catalogue is read: an agreement ending within 18 months is announced within about a year. */
export const UPCOMING_MONTHS = 18;

/** "feb" for a calendar date, from the app's own short month names (as in "9 nov"). */
function shortMonth(isoDate: string): string {
  return formatShortDate(isoDate, "never").split(" ").at(-1) ?? "";
}

/** "feb–maj 2027", "nov 2026–feb 2027" across a year end, or "feb 2027" for a single month. */
export function periodText(fromIsoDate: string, toIsoDate: string): string {
  const fromYear = fromIsoDate.slice(0, 4);
  const toYear = toIsoDate.slice(0, 4);
  const from = shortMonth(fromIsoDate);
  const to = shortMonth(toIsoDate);
  if (fromYear !== toYear) return `${from} ${fromYear}–${to} ${toYear}`;
  if (from === to) return `${from} ${toYear}`;
  return `${from}–${to} ${toYear}`;
}

/**
 * The period as two lines for a narrow column: the months ("feb–maj") and the year ("2027", or "2026–2027" across a
 * year end), so every row of a timeline breaks in the same place.
 */
export function periodLines(fromIsoDate: string, toIsoDate: string): { months: string; years: string } {
  const fromYear = fromIsoDate.slice(0, 4);
  const toYear = toIsoDate.slice(0, 4);
  const from = shortMonth(fromIsoDate);
  const to = shortMonth(toIsoDate);
  return {
    months: from === to && fromYear === toYear ? from : `${from}–${to}`,
    years: fromYear === toYear ? toYear : `${fromYear}–${toYear}`,
  };
}

/** "Nuvarande avtal löper ut 30 november 2027 och kan förlängas till längst 28 februari 2029." */
export function agreementEndText(item: Pick<UpcomingProcurement, "end_date" | "max_end_date">): string {
  const extension =
    item.max_end_date && item.max_end_date !== item.end_date
      ? ` och kan förlängas till längst ${formatLongDate(item.max_end_date)}`
      : "";
  return `Nuvarande avtal löper ut ${formatLongDate(item.end_date)}${extension}.`;
}

/** Soonest expected first; those the company's codes match first when `relevantFirst`. */
export function sortUpcoming(items: readonly UpcomingProcurement[], relevantFirst = false): UpcomingProcurement[] {
  return [...items].sort(
    (a, b) =>
      (relevantFirst ? Number(b.relevant_for_company) - Number(a.relevant_for_company) : 0) ||
      a.expected_from.localeCompare(b.expected_from) ||
      a.title.localeCompare(b.title, "sv"),
  );
}
