import { describe, expect, it } from "vitest";
import { percentOf, visibleFromText } from "./insights";

const NOW = new Date("2026-10-05T10:00:00Z");

describe("percentOf", () => {
  it("rounds to a whole percentage and says nothing without questions", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe("visibleFromText", () => {
  it("shows the questions from the next day when the deadline ends a day", () => {
    expect(visibleFromText("2026-11-09T23:59:00+01:00", NOW)).toBe("Visas från 10 nov");
    expect(visibleFromText("2026-11-09T23:59:59+01:00", NOW)).toBe("Visas från 10 nov");
  });

  it("gives the moment for a deadline during the day", () => {
    expect(visibleFromText("2026-11-09T12:00:00+01:00", NOW)).toBe("Visas från 9 nov kl. 12:00");
  });

  it("gives the day itself for a deadline at midnight, and the year when it is not this year", () => {
    expect(visibleFromText("2026-11-09T00:00:00+01:00", NOW)).toBe("Visas från 9 nov");
    expect(visibleFromText("2027-01-15T12:00:00+01:00", NOW)).toBe("Visas från 15 jan 2027 kl. 12:00");
  });

  it("explains when there is no deadline", () => {
    expect(visibleFromText(null, NOW)).toBe("Visas när sista anbudsdag har passerat");
  });
});
