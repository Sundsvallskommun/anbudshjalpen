import { describe, expect, it } from "vitest";
import { bodyAddsToTitle, keepNumbersTogether, normalizeForComparison, splitTitleAndBody } from "./text";

describe("keepNumbersTogether", () => {
  it("keeps a number's digit groups on one line and leaves other spaces alone", () => {
    expect(keepNumbersTogether("försäkringsbelopp 5 000 000 kronor")).toBe("försäkringsbelopp 5\u00a0000\u00a0000 kronor");
    expect(keepNumbersTogether("minst 2 uppdrag under 2025")).toBe("minst 2 uppdrag under 2025");
    expect(keepNumbersTogether("år 2025 30 dagar")).toBe("år 2025 30 dagar");
  });
});

describe("bodyAddsToTitle", () => {
  it("hides a body that only repeats the title", () => {
    expect(normalizeForComparison("  Anbudet är  skrivet på svenska. ")).toBe("anbudet är skrivet på svenska");
    expect(bodyAddsToTitle("Anbudet är skrivet på svenska", "Anbudet är skrivet på svenska.")).toBe(false);
    expect(bodyAddsToTitle("Alternativa anbud godtas inte…", "alternativa anbud godtas inte")).toBe(false);
    expect(bodyAddsToTitle("Titel", "")).toBe(false);
    expect(bodyAddsToTitle("Titel", null)).toBe(false);
  });

  it("shows a body that says more", () => {
    expect(
      bodyAddsToTitle("Ansvarsförsäkring om minst 5 miljoner kronor", "Företaget måste ha en ansvarsförsäkring och visa ett försäkringsbevis."),
    ).toBe(true);
  });
});

describe("splitTitleAndBody", () => {
  it("lets a title cut off with an ellipsis give way to the body's whole sentence", () => {
    expect(
      splitTitleAndBody(
        "Anbudet ska innehålla samtliga bilagor som enligt avsnitt 7 ska lämnas med …",
        "Anbudet ska innehålla samtliga bilagor som enligt avsnitt 7 ska lämnas med anbudet.",
      ),
    ).toEqual({ title: "Anbudet ska innehålla samtliga bilagor som enligt avsnitt 7 ska lämnas med anbudet.", body: null });
    expect(splitTitleAndBody("Vid anbud i grupp ska …", "Vid anbud i grupp ska en part anges. Alla tar ansvar.")).toEqual({
      title: "Vid anbud i grupp ska en part anges.",
      body: "Alla tar ansvar.",
    });
  });

  it("does not end a sentence inside a law reference", () => {
    expect(splitTitleAndBody("Arbetet följer …", "Arbetet följer 19 kap. 2 § LOU och avtalet. Mer text.")).toEqual({
      title: "Arbetet följer 19 kap. 2 § LOU och avtalet.",
      body: "Mer text.",
    });
  });

  it("shows only what a body adds after the title", () => {
    expect(
      splitTitleAndBody(
        "Priser ska anges i prisbilagan (bilaga 1)",
        "Priser ska anges i prisbilagan (bilaga 1). Prisbilagan får inte ändras.",
      ),
    ).toEqual({ title: "Priser ska anges i prisbilagan (bilaga 1)", body: "Prisbilagan får inte ändras." });
  });

  it("drops a body that repeats the title and keeps one that says something else", () => {
    expect(splitTitleAndBody("Alternativa anbud godtas inte", "Alternativa anbud godtas inte.")).toEqual({
      title: "Alternativa anbud godtas inte",
      body: null,
    });
    expect(splitTitleAndBody("Ansvarsförsäkring", "Företaget måste visa ett försäkringsbevis.")).toEqual({
      title: "Ansvarsförsäkring",
      body: "Företaget måste visa ett försäkringsbevis.",
    });
  });
});
