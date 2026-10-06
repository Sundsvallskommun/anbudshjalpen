import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formalQuestionSentence } from "./FormalQuestionAdvice";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formalQuestionSentence", () => {
  it("names frågestopp as a date, without an invented time", () => {
    expect(formalQuestionSentence("2026-10-30T23:59:59+01:00")).toBe(
      "Ställ frågan i e-Avrop senast 30 oktober – då får alla leverantörer samma svar.",
    );
    expect(formalQuestionSentence("2027-01-15T23:59:59+01:00")).toBe(
      "Ställ frågan i e-Avrop senast 15 januari 2027 – då får alla leverantörer samma svar.",
    );
  });

  it("says when frågestopp has passed, and where the date is when it is unknown", () => {
    expect(formalQuestionSentence("2026-10-01T23:59:59+02:00")).toBe("Sista dag för frågor var 1 oktober. Det är underlaget som gäller.");
    expect(formalQuestionSentence(null)).toMatch(/före sista dag för frågor .*Datumet står i underlaget\.$/u);
  });
});
