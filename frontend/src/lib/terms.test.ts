import { describe, expect, it } from "vitest";
import { splitByTerms } from "./terms";

describe("splitByTerms", () => {
  it("marks the first occurrence of each term, whatever its case", () => {
    expect(splitByTerms("ESPD lämnas. Även espd i bilaga.", ["ESPD"])).toEqual([
      { text: "ESPD", term: "ESPD" },
      { text: " lämnas. Även espd i bilaga." },
    ]);
  });

  it("matches whole words only", () => {
    expect(splitByTerms("Prisbilagan bifogas.", ["bilaga"])).toEqual([{ text: "Prisbilagan bifogas." }]);
  });

  it("prefers the longer of two overlapping terms", () => {
    const segments = splitByTerms("Krav på ekonomisk stabilitet.", ["stabilitet", "ekonomisk stabilitet"]);
    expect(segments).toEqual([
      { text: "Krav på " },
      { text: "ekonomisk stabilitet", term: "ekonomisk stabilitet" },
      { text: "." },
    ]);
  });

  it("handles Swedish letters at word boundaries", () => {
    expect(splitByTerms("Avtalsspärr gäller.", ["avtalsspärr"])[0]).toEqual({ text: "Avtalsspärr", term: "avtalsspärr" });
  });

  it("returns the text unchanged without terms", () => {
    expect(splitByTerms("Text.", [])).toEqual([{ text: "Text." }]);
    expect(splitByTerms("", ["x"])).toEqual([]);
  });
});
