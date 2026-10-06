import { describe, expect, it } from "vitest";
import { answerParts, quoteClaim } from "./answerText";

describe("answerParts", () => {
  it("shows no lead for the rule-based engine's quotes, which the citation list shows with their pages", () => {
    const answer = "Det här står i underlaget:\n– Leverantören ska ha en ansvarsförsäkring (sida 4)\n– Försäkringsbevis ska bifogas (sida 7)";
    expect(answerParts({ answer, found_in_document: true })).toEqual({ lead: null, paragraphs: [] });
  });

  it("leads with a language model's one-sentence conclusion", () => {
    const answer =
      "Ni behöver en ansvarsförsäkring på minst 5 000 000 kronor. Försäkringsbeviset ska bifogas som bilaga 4.\n\nKontrollera beloppet i 19 kap. LOU.";
    expect(answerParts({ answer, found_in_document: true })).toEqual({
      lead: "Ni behöver en ansvarsförsäkring på minst 5 000 000 kronor.",
      paragraphs: ["Försäkringsbeviset ska bifogas som bilaga 4.", "Kontrollera beloppet i 19 kap. LOU."],
    });
  });

  it("leaves out the closing advice of a not-found answer, which the advice box gives with the date", () => {
    const answer =
      "Inget i underlaget verkar besvara frågan. Ställ frågan i e-Avrop före sista dag för frågor, så får alla leverantörer samma svar.";
    expect(answerParts({ answer, found_in_document: false })).toEqual({
      lead: "Inget i underlaget verkar besvara frågan.",
      paragraphs: [],
    });
  });

  it("does not end a sentence inside a law reference", () => {
    expect(answerParts({ answer: "Det regleras i 19 kap. LOU och gäller alla.", found_in_document: true }).lead).toBe(
      "Det regleras i 19 kap. LOU och gäller alla.",
    );
  });
});

describe("quoteClaim", () => {
  it("keeps a short quote and cuts a long one after eight words", () => {
    expect(quoteClaim("Pris 70 %")).toBe("Pris 70 %");
    expect(quoteClaim("Anbudsgivaren ska ha en ansvarsförsäkring som gäller för den verksamhet som uppdraget avser")).toBe(
      "Anbudsgivaren ska ha en ansvarsförsäkring som gäller för …",
    );
  });
});
