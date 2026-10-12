import { describe, expect, it } from "vitest";
import {
  CHECK_STATUS,
  citationPage,
  engineDescription,
  engineLabel,
  FIT,
  STEPS,
  verificationText,
} from "./labels";

describe("labels", () => {
  it("never promises a fit or a verdict the engine cannot know", () => {
    expect(FIT).toEqual({ passar: "Verkar passa", passar_delvis: "Passar delvis", passar_inte: "Verkar inte passa" });
    expect(Object.values(CHECK_STATUS)).toEqual(["Ser bra ut", "Bevis saknas", "Hittades inte", "Kontrollera själv"]);
  });

  it("opens a citation on the page where the quote was found", () => {
    expect(citationPage({ check: "verified", page: 5, found_page: null })).toBe(5);
    expect(citationPage({ check: "moved", page: 7, found_page: 9 })).toBe(9);
    expect(citationPage({ check: "unverified", page: 7, found_page: 9 })).toBe(7);
  });

  it("sums up the sources once, with words only for the deviations", () => {
    const summary = { citations_total: 86, citations_verified: 86, citations_moved: 0, citations_unverified: 0 };
    expect(verificationText(summary)).toBe("Alla 86 källhänvisningar hittades i underlaget");
    expect(verificationText({ ...summary, citations_verified: 84, citations_moved: 2 })).toBe(
      "Alla 86 källhänvisningar hittades i underlaget · 2 på en annan sida än AI:n angav",
    );
    expect(verificationText({ ...summary, citations_verified: 83, citations_unverified: 3 })).toBe(
      "83 av 86 källhänvisningar hittades i underlaget · 3 hittades inte och behöver kontrolleras",
    );
    expect(verificationText({ ...summary, citations_total: 1, citations_verified: 1 })).toBe(
      "Källhänvisningen hittades i underlaget",
    );
    expect(verificationText({ ...summary, citations_total: 0, citations_verified: 0 })).toBeNull();
  });

  it("names the engine in the reader's words", () => {
    expect(engineLabel("heuristic")).toBe("regelbaserad motor");
    expect(engineLabel("eneo")).toBe("AI via Eneo");
    expect(engineLabel("something-new")).toBe("AI");
    expect(engineLabel("heuristic")).not.toMatch(/språkmodell/);
  });

  it("describes the engine from what it worked on: the documents, or the law", () => {
    expect(engineDescription("heuristic")).toMatch(/i underlaget med fasta regler/);
    expect(engineDescription("heuristic", "law")).toMatch(/paragrafer i lagen om offentlig upphandling \(LOU\)/);
    expect(engineDescription("eneo", "law")).toBe(
      "Svaret togs fram med AI via Eneo, Sundsvalls kommuns AI-plattform, utifrån lagen om offentlig upphandling.",
    );
    expect(engineDescription("something-new", "law")).toBe("Svaret togs fram med en AI-modell utifrån lagen om offentlig upphandling.");
    for (const basis of ["document", "law"] as const) {
      for (const engine of ["heuristic", "eneo", "openai"]) expect(engineDescription(engine, basis)).not.toMatch(/språkmodell/);
    }
  });

  it("keeps the step values the address has always used", () => {
    expect(STEPS.map((step) => `${step.number} ${step.label}`)).toEqual(["1 Krav", "2 Granska", "3 Lämna in"]);
    expect(STEPS.map((step) => step.value)).toEqual(["checklista", "granska", "inlamning"]);
  });
});
