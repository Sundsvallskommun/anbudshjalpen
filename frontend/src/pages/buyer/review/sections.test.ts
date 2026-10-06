import { describe, expect, it } from "vitest";
import { evaluationHeading, expectedKind, headingAbove, headingNoun, kindMismatch } from "./sections";

const PAGE = [
  "Sundsvalls kommun – Livsmedel – frukt och grönt",
  "2 Kvalificering",
  "Kommunen prövar om det finns grund för uteslutning.",
  "Anbudsgivaren ska ha ett dokumenterat system för egenkontroll",
  "som bygger på principerna i HACCP.",
  "3 Krav på varorna",
  "Frukt och grönsaker ska minst uppfylla kraven för klass I.",
].join("\n");

describe("headingAbove", () => {
  it("finds the numbered heading the quote stands under, also when the quote spans lines", () => {
    expect(headingAbove(PAGE, "dokumenterat system för egenkontroll som bygger på principerna i HACCP")).toBe(
      "2 Kvalificering",
    );
    expect(headingAbove(PAGE, "kraven för klass I")).toBe("3 Krav på varorna");
  });

  it("says nothing when the quote is not on the page or stands above every heading", () => {
    expect(headingAbove(PAGE, "Ansvarsförsäkring om minst 5 miljoner")).toBeNull();
    expect(headingAbove(PAGE, "Sundsvalls kommun – Livsmedel")).toBeNull();
  });
});

describe("expectedKind", () => {
  it("reads the kind a clear heading announces", () => {
    expect(expectedKind("2 Kvalificering")).toBe("kvalificeringskrav");
    expect(expectedKind("4.2 Krav på leverantören")).toBe("kvalificeringskrav");
    expect(expectedKind("6 Kommersiella villkor")).toBe("avtalsvillkor");
    expect(expectedKind("1.4 Anbudets form och innehåll")).toBe("skallkrav");
    expect(expectedKind("3 Krav på varorna")).toBe("krav_pa_uppdraget");
  });

  it("says nothing for a heading that does not announce a kind", () => {
    expect(expectedKind("1.3 Förfarande och tidsplan")).toBeNull();
  });
});

describe("kindMismatch", () => {
  it("flags a requirement whose kind disagrees with its heading", () => {
    expect(kindMismatch("krav_pa_uppdraget", "2 Kvalificering")).toEqual({
      heading: "2 Kvalificering",
      expected: "kvalificeringskrav",
    });
    expect(kindMismatch("kvalificeringskrav", "2 Kvalificering")).toBeNull();
    expect(kindMismatch("skallkrav", "1.3 Förfarande och tidsplan")).toBeNull();
    expect(kindMismatch("skallkrav", null)).toBeNull();
  });
});

describe("evaluationHeading", () => {
  it("finds the first numbered heading about evaluation in page order, not a table of contents line", () => {
    const texts = new Map([
      [6, "4 Utvärdering\nUtvärderingen görs på grunden pris.\n5 Avtalsvillkor"],
      [2, "Innehåll\n4 Utvärdering 6\n1.3 Förfarande och tidsplan"],
    ]);
    expect(evaluationHeading(texts)).toEqual({ heading: "4 Utvärdering", page: 6 });
  });

  it("finds a heading about the grounds for the award, and nothing on pages without one", () => {
    expect(evaluationHeading(new Map([[3, "3.2 Tilldelningsgrund"]]))).toEqual({ heading: "3.2 Tilldelningsgrund", page: 3 });
    expect(evaluationHeading(new Map([[1, PAGE]]))).toBeNull();
  });
});

describe("headingNoun", () => {
  it("calls a top-level heading a chapter and a numbered subheading a section", () => {
    expect(headingNoun("4 Utvärdering")).toBe("kapitlet");
    expect(headingNoun("4. Utvärdering")).toBe("kapitlet");
    expect(headingNoun("4.2 Utvärderingsmodell")).toBe("avsnittet");
  });
});
