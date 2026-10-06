import { describe, expect, it } from "vitest";
import {
  calendarDateOf,
  calendarDaysUntil,
  daysInWords,
  daysUntil,
  formatCalendarDate,
  formatClock,
  formatLongDate,
  formatSekShort,
  formatShortDate,
  isClosingSoon,
  isDateOnly,
  isPassed,
  relativeDays,
  timeOfDay,
  formatDateTime,
  formatMonthRange,
  plural,
  relativeCalendarDeadline,
  relativeDeadline,
  splitList,
  swedishDate,
  swedishTimeToIso,
  swedishToday,
} from "./format";

describe("dates in Swedish time", () => {
  it("formats a timestamp in Swedish time whatever the input offset", () => {
    expect(formatDateTime("2026-10-14T10:00:00Z")).toBe("14 oktober 2026 kl. 12:00");
  });

  it("formats a calendar date without shifting it", () => {
    expect(formatCalendarDate("2026-01-01")).toBe("1 januari 2026");
  });

  it("counts calendar days to a deadline", () => {
    const now = new Date("2026-10-05T21:00:00Z"); // 23:00 in Stockholm
    expect(daysUntil("2026-10-05T22:30:00Z", now)).toBe(1); // 00:30 the next day
    expect(relativeDeadline("2026-10-06T10:00:00Z", now)).toBe("i morgon");
    expect(relativeDeadline("2026-10-14T10:00:00Z", now)).toBe("om 9 dagar");
    expect(relativeDeadline("2026-10-05T20:00:00Z", now)).toBe("passerad");
  });

  it("reads a date-only deadline sent as Swedish midnight as its own day", () => {
    expect(swedishDate("2026-10-30T00:00:00+01:00")).toBe("2026-10-30");
    expect(swedishDate("2026-10-29T23:00:00Z")).toBe("2026-10-30");
    expect(swedishToday(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
  });

  it("counts the whole deadline day as still open", () => {
    const now = new Date("2026-10-30T15:00:00+01:00");
    expect(relativeCalendarDeadline("2026-10-30", now)).toBe("i dag");
    expect(relativeCalendarDeadline("2026-10-31", now)).toBe("i morgon");
    expect(relativeCalendarDeadline("2026-11-09", now)).toBe("om 10 dagar");
    expect(relativeCalendarDeadline("2026-10-29", now)).toBe("passerad");
  });

  it("writes a month range compactly", () => {
    expect(formatMonthRange("2027-03-01", "2027-06-30")).toBe("mars–juni 2027");
    expect(formatMonthRange("2026-11-01", "2027-02-01")).toBe("november 2026–februari 2027");
    expect(formatMonthRange("2027-03-01", "2027-03-31")).toBe("mars 2027");
  });

  it("turns a Swedish wall-clock time into an ISO timestamp in summer and winter", () => {
    expect(swedishTimeToIso("2026-06-15", "23:59")).toBe("2026-06-15T21:59:00.000Z");
    expect(swedishTimeToIso("2026-12-15", "23:59")).toBe("2026-12-15T22:59:00.000Z");
  });
});

describe("text helpers", () => {
  it("pluralises with Swedish number formatting", () => {
    expect(plural(1, "upphandling", "upphandlingar")).toBe("1 upphandling");
    // sv-SE groups thousands with a no-break space.
    expect(plural(1200, "sida", "sidor")).toBe("1\u00a0200 sidor");
  });

  it("splits a comma-separated field", () => {
    expect(splitList(" Sundsvall, Timrå ,, ")).toEqual(["Sundsvall", "Timrå"]);
  });
});

describe("the copy rules' short forms", () => {
  const now = new Date("2026-10-05T10:00:00+02:00");

  it("writes dates short in lists and long in running text, with the year only when asked or not this year", () => {
    expect(formatShortDate("2026-11-09T23:59:00+01:00", "auto", now)).toBe("9 nov");
    expect(formatShortDate("2026-11-09", "always", now)).toBe("9 nov 2026");
    expect(formatShortDate("2027-06-25", "auto", now)).toBe("25 jun 2027");
    expect(formatLongDate("2026-10-30", "always", now)).toBe("30 oktober 2026");
    expect(formatLongDate("2026-10-30", "never", now)).toBe("30 oktober");
  });

  it("gives a time only to a deadline that has one of its own", () => {
    expect(formatClock("2026-11-09T23:59:00+01:00")).toBe("kl. 23:59");
    expect(formatClock("2026-10-07T08:00:00+02:00")).toBe("kl. 08:00");
    // Date-only deadlines: a calendar date, midnight, or the end of the day as the backend sends them.
    expect(formatClock("2026-10-30")).toBeNull();
    expect(formatClock("2026-10-30T00:00:00+01:00")).toBeNull();
    expect(timeOfDay("2026-10-16T23:59:59+02:00")).toBeNull();
  });

  it("says how far away a deadline is, the whole day counting for a date", () => {
    expect(relativeDays("2026-11-09T23:59:00+01:00", now)).toBe("om 35 dagar");
    expect(relativeDays("2026-10-05", now)).toBe("i dag");
    expect(relativeDays("2026-10-06", now)).toBe("i morgon");
    expect(relativeDays("2026-10-04", now)).toBe("passerat");
    // A timestamp passes at its moment, a date at the end of its day.
    expect(relativeDays("2026-10-05T09:00:00+02:00", now)).toBe("passerat");
    expect(relativeDays("2026-10-05T23:00:00+02:00", now)).toBe("i dag");
    expect(calendarDaysUntil("2026-10-30", now)).toBe(25);
  });

  it("calls a deadline seven days away or closer that is still open closing soon", () => {
    expect(isClosingSoon("2026-10-12", now)).toBe(true);
    expect(isClosingSoon("2026-10-13", now)).toBe(false);
    expect(isClosingSoon("2026-10-04", now)).toBe(false);
    expect(isPassed("2026-10-04", now)).toBe(true);
  });

  it("writes amounts short beside a figure, and counts of days in words in running text", () => {
    expect(formatSekShort(5_000_000)).toBe("5 mnkr");
    expect(formatSekShort(2_500_000)).toBe("2,5 mnkr");
    expect(formatSekShort(900_000)).toBe("900 000 kr");
    expect(daysInWords(2)).toBe("två dagar");
    expect(daysInWords(1)).toBe("en dag");
    expect(daysInWords(14)).toBe("14 dagar");
    expect(isDateOnly("2026-10-30")).toBe(true);
    expect(calendarDateOf("2026-10-29T23:00:00Z")).toBe("2026-10-30");
  });
});
