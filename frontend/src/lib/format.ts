/**
 * Dates, numbers and counts as Swedish readers expect them. Times are shown in Swedish time whatever the
 * browser's zone, because every deadline in a procurement is a Swedish deadline.
 */

const ZONE = "Europe/Stockholm";
const LOCALE = "sv-SE";

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" });
const calendarDayFormat = new Intl.DateTimeFormat(LOCALE, { timeZone: ZONE });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const calendarDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const sekFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat(LOCALE);

/** "14 oktober 2026" for an ISO timestamp. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "14 oktober 2026 kl. 12:00" for an ISO timestamp. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormat.format(date)} kl. ${timeFormat.format(date)}`;
}

/** "14 oktober 2026" for a calendar date ("YYYY-MM-DD"), without any time-zone shift. */
export function formatCalendarDate(isoDate: string): string {
  return calendarDateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

/** "mars 2027" for a calendar date. */
export function formatMonth(isoDate: string): string {
  return monthFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

/** "mars–juni 2027", or "november 2026–februari 2027" across a year end. */
export function formatMonthRange(fromIsoDate: string, toIsoDate: string): string {
  const from = formatMonth(fromIsoDate);
  const to = formatMonth(toIsoDate);
  if (from === to) return from;
  const fromYear = fromIsoDate.slice(0, 4);
  const toYear = toIsoDate.slice(0, 4);
  return fromYear === toYear ? `${from.replace(` ${fromYear}`, "")}–${to}` : `${from}–${to}`;
}

function swedishCalendarDay(date: Date): number {
  const [year, month, day] = calendarDayFormat.format(date).split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000;
}

/** Whole Swedish calendar days from `now` until the timestamp; negative when it has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return swedishCalendarDay(new Date(iso)) - swedishCalendarDay(now);
}

/** The Swedish calendar date ("YYYY-MM-DD") of an ISO timestamp, e.g. a date-only deadline sent as midnight. */
export function swedishDate(iso: string): string {
  return calendarDayFormat.format(new Date(iso));
}

/** Today's calendar date in Sweden ("YYYY-MM-DD"), to compare with date-only deadlines. */
export function swedishToday(now: Date = new Date()): string {
  return calendarDayFormat.format(now);
}

/** "i dag", "i morgon", "om 9 dagar", "passerad" for a date-only deadline ("YYYY-MM-DD"): the whole day counts. */
export function relativeCalendarDeadline(isoDate: string, now: Date = new Date()): string {
  const days = Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000 - swedishCalendarDay(now);
  if (days < 0) return "passerad";
  if (days === 0) return "i dag";
  if (days === 1) return "i morgon";
  return `om ${days} dagar`;
}

/** "i dag", "i morgon", "om 9 dagar", "passerad" for a deadline. */
export function relativeDeadline(iso: string, now: Date = new Date()): string {
  const days = daysUntil(iso, now);
  if (new Date(iso).getTime() < now.getTime()) return "passerad";
  if (days === 0) return "i dag";
  if (days === 1) return "i morgon";
  return `om ${days} dagar`;
}

/** "1 200 000 kr". */
export function formatSek(amount: number): string {
  return sekFormat.format(amount);
}

/** "1 200". */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** "1 upphandling", "3 upphandlingar". */
export function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

const wallClockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * An ISO timestamp for a Swedish wall-clock time on a calendar date ("2026-10-14", "23:59"), whatever the
 * browser's zone and whether summer time applies that day.
 */
export function swedishTimeToIso(isoDate: string, time: string): string {
  const guess = new Date(`${isoDate}T${time}:00Z`);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(wallClockFormat.formatToParts(guess).find((item) => item.type === type)?.value);
  const wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
  return new Date(guess.getTime() - (wallClock - guess.getTime())).toISOString();
}

/** "Sundsvall, Timrå" -> ["Sundsvall", "Timrå"]: a comma-separated field as a list. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
