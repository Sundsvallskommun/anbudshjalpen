import { describe, expect, it } from "vitest";
import {
  daysUntil,
  formatCalendarDate,
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
