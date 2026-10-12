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
const clockWithSecondsFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: ZONE });
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

// --- The copy rules' short forms (direction.md, section 7) -------------------------------------
//
// "9 nov" in lists and "9 november 2026" in running text, a time as "kl. 23:59", and the relative time beside it:
// "om 35 dagar", "i dag", "i morgon", "passerat". A deadline is either a calendar date ("2026-10-30", the whole day
// counts) or a timestamp with a time of day; both are read in Swedish time.

/** Three-letter months without a full stop, as the design writes them ("9 nov", "17 maj – 25 jun 2027"). */
const SHORT_MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;
const LONG_MONTHS = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether the value is a calendar date ("YYYY-MM-DD") rather than a timestamp. */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

/** The Swedish calendar date ("YYYY-MM-DD") of a calendar date or a timestamp. */
export function calendarDateOf(value: string): string {
  return isDateOnly(value) ? value : swedishDate(value);
}

function dateParts(value: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = calendarDateOf(value).split("-").map(Number);
  return { year, month, day };
}

export type YearDisplay = "always" | "never" | "auto";

function withYear(text: string, year: number, display: YearDisplay, now: Date): string {
  const show = display === "always" || (display === "auto" && year !== Number(swedishToday(now).slice(0, 4)));
  return show ? `${text} ${year}` : text;
}

/** "9 nov", or "9 nov 2026" (`year`: always, never, or auto = only when it is not this year). */
export function formatShortDate(value: string, year: YearDisplay = "auto", now: Date = new Date()): string {
  const parts = dateParts(value);
  return withYear(`${parts.day} ${SHORT_MONTHS[parts.month - 1]}`, parts.year, year, now);
}

/** "9 november 2026", or "9 november" (`year`: always, never, or auto = only when it is not this year). */
export function formatLongDate(value: string, year: YearDisplay = "always", now: Date = new Date()): string {
  const parts = dateParts(value);
  return withYear(`${parts.day} ${LONG_MONTHS[parts.month - 1]}`, parts.year, year, now);
}

/**
 * The time of day of a timestamp in Swedish time ("23:59"), or null for a calendar date and for a date sent as
 * the start or the end of its day (00:00, 23:59:59), which the backend uses for date-only deadlines.
 */
export function timeOfDay(value: string): string | null {
  if (isDateOnly(value)) return null;
  const date = new Date(value);
  const time = timeFormat.format(date);
  const seconds = Number(
    new Intl.DateTimeFormat("en-GB", { second: "2-digit", timeZone: ZONE }).format(date),
  );
  if (time === "00:00" || (time === "23:59" && seconds === 59)) return null;
  return time;
}

/** "kl. 23:59", or null when the value has no time of day of its own. */
export function formatClock(value: string): string | null {
  const time = timeOfDay(value);
  return time ? `kl. ${time}` : null;
}

/** "kl. 15:37:12" for a moment the reader watches move, such as when a page last asked the server. */
export function formatClockWithSeconds(value: string | number | Date): string {
  return `kl. ${clockWithSecondsFormat.format(new Date(value))}`;
}

/**
 * Whole Swedish calendar days from today until the deadline's day: 0 today, 1 tomorrow, negative when the day
 * has passed. A calendar date counts as its whole day.
 */
export function calendarDaysUntil(value: string, now: Date = new Date()): number {
  return Date.parse(`${calendarDateOf(value)}T00:00:00Z`) / 86_400_000 - swedishCalendarDay(now);
}

/** Whether a deadline has passed: a calendar date after its day, a timestamp after its moment. */
export function isPassed(value: string, now: Date = new Date()): boolean {
  if (isDateOnly(value) || timeOfDay(value) === null) return calendarDaysUntil(value, now) < 0;
  return new Date(value).getTime() < now.getTime();
}

/** "i dag", "i morgon", "om 35 dagar" or "passerat" for a deadline (calendar date or timestamp). */
export function relativeDays(value: string, now: Date = new Date()): string {
  if (isPassed(value, now)) return "passerat";
  const days = calendarDaysUntil(value, now);
  if (days <= 0) return "i dag";
  if (days === 1) return "i morgon";
  return `om ${formatNumber(days)} dagar`;
}

/** How many days ahead a deadline counts as closing soon (direction.md: "7 dagar eller färre"). */
export const CLOSING_SOON_DAYS = 7;

/** Whether a deadline is still open and at most seven days away. */
export function isClosingSoon(value: string, now: Date = new Date()): boolean {
  return !isPassed(value, now) && calendarDaysUntil(value, now) <= CLOSING_SOON_DAYS;
}

const shortNumberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** "5 mnkr" for a million or more, else "900 000 kr": the short form beside a figure. */
export function formatSekShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `${shortNumberFormat.format(amount / 1_000_000)} mnkr`;
  return formatSek(amount);
}

const SMALL_NUMBERS = ["noll", "en", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"] as const;

/** "två dagar", "en dag", "12 dagar": a count in words up to ten, as running text writes it. */
export function daysInWords(days: number): string {
  const count = Math.abs(days);
  const number = count <= 10 ? SMALL_NUMBERS[count] : formatNumber(count);
  return `${number} ${count === 1 ? "dag" : "dagar"}`;
}
