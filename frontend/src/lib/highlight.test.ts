import { describe, expect, it } from "vitest";
import { findQuote, splitAtRange } from "./highlight";

const PAGE = "3.2 Försäkring\nLeverantören ska ha en\nansvarsförsäkring om minst 5 000 000 kronor – ”gällande”.";

// Excerpts of the fictitious demo document (Solbacken), pages 3 and 13, as the backend extracts them.
const TERMS_PAGE = [
  "Uppdraget omfattar",
  "• utvändig ommålning av fasader, fönster, ytterdörrar, vindskivor och takfotsbrädor,",
  "1.6 Begrepp",
  "Ska-krav Krav som måste vara uppfyllda för att ett anbud ska kunna antas.",
  "Avtalsspärr Den period efter tilldelningsbeslutet då kommunen inte får teckna kontrakt.",
].join("\n");
const TERMS_PAGE_13 = [
  "6.5 Försäkringar under kontraktstiden",
  "Leverantören ska under hela kontraktstiden ha den ansvarsförsäkring som anges i avsnitt 3.4 och på",
  "begäran visa ett giltigt försäkringsbevis.",
  "6.7 Vite vid försening",
  "Om uppdraget inte är färdigställt för slutbesiktning den 13 augusti 2027 ska leverantören betala vite",
  "med 0,5 procent av det fasta priset för varje påbörjad vecka som förseningen varar, dock högst 10",
].join("\n");

function marked(text: string, quote: string): string | null {
  const range = findQuote(text, quote);
  return range ? text.slice(range.start, range.end) : null;
}

describe("findQuote", () => {
  it("finds a quote across line breaks and in another case", () => {
    expect(marked(PAGE, "leverantören ska ha en ansvarsförsäkring")).toBe("Leverantören ska ha en\nansvarsförsäkring");
  });

  it("tolerates straight quotes and hyphens where the page has typographic ones", () => {
    expect(marked(PAGE, 'kronor - "gällande"')).toBe("kronor – ”gällande”");
  });

  it("ignores an ellipsis around the quote", () => {
    expect(marked(PAGE, "…minst 5 000 000 kronor...")).toBe("minst 5 000 000 kronor");
  });

  it("returns null when the quote is not on the page or is too short", () => {
    expect(findQuote(PAGE, "referensuppdrag i offentlig miljö")).toBeNull();
    expect(findQuote(PAGE, "en")).toBeNull();
    expect(findQuote(PAGE, "…")).toBeNull();
  });

  it("treats regular-expression characters literally", () => {
    expect(findQuote("Pris (70 %) gäller.", "Pris (70 %)")).toEqual({ start: 0, end: 11 });
  });

  // Each of these the backend's verifier counts as verified on the cited page.
  it("marks a quote shortened with an ellipsis in the middle, from its first to its last word", () => {
    expect(marked(TERMS_PAGE, "Ska-krav Krav som … ska kunna antas.")).toBe(
      "Ska-krav Krav som måste vara uppfyllda för att ett anbud ska kunna antas.",
    );
    expect(marked(TERMS_PAGE_13, "Leverantören [...] ansvarsförsäkring som anges i avsnitt 3.4")).toBe(
      "Leverantören ska under hela kontraktstiden ha den ansvarsförsäkring som anges i avsnitt 3.4",
    );
  });

  it("marks a quote written without å, ä and ö", () => {
    expect(marked(TERMS_PAGE_13, "Leverantoren ska under hela kontraktstiden ha den ansvarsforsakring")).toBe(
      "Leverantören ska under hela kontraktstiden ha den ansvarsförsäkring",
    );
  });

  it("marks a quote with guillemets or without the page's bullet", () => {
    expect(marked(TERMS_PAGE, "«Ska-krav» Krav som måste vara uppfyllda")).toBe("Ska-krav Krav som måste vara uppfyllda");
    expect(marked(TERMS_PAGE, "Uppdraget omfattar utvändig ommålning av fasader")).toBe(
      "Uppdraget omfattar\n• utvändig ommålning av fasader",
    );
  });

  it("marks a quote whose wording differs slightly from the page", () => {
    expect(marked(TERMS_PAGE_13, "Leverantören skall under hela kontraktstiden ha den ansvarsförsäkring")).toBe(
      "Leverantören ska under hela kontraktstiden ha den ansvarsförsäkring",
    );
  });

  it("never marks an approximate match with other numbers", () => {
    expect(findQuote(TERMS_PAGE_13, "leverantören betala vite med 0,9 procent av det fasta priset")).toBeNull();
    expect(marked(TERMS_PAGE_13, "leverantören betala vite med 0,5 procent av det fasta priset")).toBe(
      "leverantören betala vite\nmed 0,5 procent av det fasta priset",
    );
  });

  it("joins a word hyphenated across a line break and keeps a decomposed letter whole", () => {
    expect(marked("Alla kvalifi-\nceringskrav gäller.", "kvalificeringskrav")).toBe("kvalifi-\nceringskrav");
    const decomposed = "Leverantören ska ha två referenser.";
    expect(marked(decomposed, "ha två")).toBe("ha två");
  });

  it("does not mark a short quote approximately", () => {
    expect(findQuote(TERMS_PAGE, "Avtalsspärrar")).toBeNull();
  });
});

describe("splitAtRange", () => {
  it("splits around the match", () => {
    expect(splitAtRange("abc def ghi", { start: 4, end: 7 })).toEqual([
      { text: "abc ", isMatch: false },
      { text: "def", isMatch: true },
      { text: " ghi", isMatch: false },
    ]);
  });

  it("returns the whole text when nothing matched", () => {
    expect(splitAtRange("abc", null)).toEqual([{ text: "abc", isMatch: false }]);
  });
});
