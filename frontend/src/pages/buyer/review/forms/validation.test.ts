import { describe, expect, it } from "vitest";
import { draftChecklistView } from "../../../../test/fixtures";
import {
  citationErrors,
  evaluationErrors,
  hasErrors,
  requirementErrors,
  summaryErrors,
  termErrors,
} from "./validation";

const requirement = draftChecklistView.checklist.requirements[0]!;

describe("citationErrors", () => {
  it("asks for a page in the document and a quote of 3–400 characters", () => {
    expect(citationErrors({ page: 4, quote: "Leverantören ska ha en ansvarsförsäkring" }, 16)).toEqual({});
    expect(citationErrors({ page: 0, quote: "ok" }, 16)).toEqual({
      page: "Ange sidan där citatet står.",
      quote: "Citatet ska vara 3–400 tecken, ordagrant från sidan.",
    });
    expect(citationErrors({ page: 17, quote: "Leverantören" }, 16).page).toBe(
      "Underlaget har 16 sidor. Ange en sida mellan 1 och 16.",
    );
  });
});

describe("item forms", () => {
  it("asks for a requirement's words and keeps the title within the contract's 160 characters", () => {
    expect(hasErrors(requirementErrors(requirement, 16))).toBe(false);
    const errors = requirementErrors({ ...requirement, title: "x".repeat(161), plain_language: " " }, 16);
    expect(errors.title).toBe("Kravet får vara högst 160 tecken. Förklara resten nedan.");
    expect(errors.plain_language).toBe("Förklara kravet med enkla ord.");
  });

  it("lets a criterion's weight be empty but not outside 0–100", () => {
    const criterion = draftChecklistView.checklist.evaluation[0]!;
    expect(evaluationErrors({ ...criterion, weight_percent: null }, 16).weight_percent).toBeUndefined();
    expect(evaluationErrors({ ...criterion, weight_percent: 120 }, 16).weight_percent).toMatch(/mellan 0 och 100/);
  });

  it("checks a term's source only when it has one", () => {
    const term = draftChecklistView.checklist.terms[0]!;
    expect(termErrors(term, 16)).toEqual({});
    expect(termErrors({ ...term, citation: { page: 1, quote: "", check: null, found_page: null } }, 16).quote).toBeDefined();
  });

  it("asks for a summary", () => {
    expect(summaryErrors("")).toEqual({ summary: "Skriv 2–4 meningar för företagen om vad upphandlingen gäller." });
    expect(summaryErrors("Kommunen vill måla om förskolan.")).toEqual({});
  });
});
