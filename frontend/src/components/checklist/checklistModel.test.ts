import { describe, expect, it } from "vitest";
import type { Checklist, Citation, EvaluationCriterion, KeyDate, RequiredAttachment } from "../../api/types";
import { checklistView } from "../../test/fixtures";
import {
  attachmentGroups,
  cleanDateText,
  criterionDetail,
  dateGroups,
  evaluationFigure,
  evaluationShares,
  REQUIREMENT_SECTIONS,
  requirementsByKind,
  termPreview,
} from "./checklistModel";

const cite = (page: number, quote: string): Citation => ({ page, quote, check: "verified", found_page: null });

function attachment(name: string, quote: string, page = 7, description: string | null = null): RequiredAttachment {
  return { name, description, citation: cite(page, quote) };
}

function date(kind: KeyDate["kind"], value: string | null, description: string, page = 4): KeyDate {
  return { kind, date: value, description, citation: cite(page, description) };
}

function withDates(dates: KeyDate[]): Checklist {
  return { ...checklistView.checklist, dates };
}

describe("requirement sections", () => {
  it("opens skallkrav and kvalificeringskrav and closes the rest, in reading order", () => {
    expect(REQUIREMENT_SECTIONS.map((section) => [section.id, section.defaultOpen])).toEqual([
      ["skallkrav", true],
      ["kvalificeringskrav", true],
      ["krav-pa-uppdraget", false],
      ["avtalsvillkor", false],
    ]);
    const groups = requirementsByKind(checklistView.checklist.requirements);
    expect(groups.skallkrav.map((requirement) => requirement.id)).toEqual(["K1"]);
    expect(groups.avtalsvillkor).toEqual([]);
  });
});

describe("attachments", () => {
  // As the rule-based extraction lists them for the demo document.
  const extracted = [
    attachment("Bilaga 1", "Priser ska anges i svenska kronor exklusive mervärdesskatt i prisbilagan (bilaga 1).", 5),
    attachment("Bilaga 3", "Anbudsgivaren ska intyga att det inte finns grund för uteslutning genom att underteckna sanningsförsäkran (bilaga 3) och lämna den med anbudet."),
    attachment("Intyg", "Anbudsgivare som är etablerade i Sverige behöver därför inte bifoga intyg om detta."),
    attachment("Bilaga 4", "Försäkringsbevis ska bifogas anbudet (bilaga 4)."),
    attachment("Försäkringsbevis", "Försäkringsbevis ska bifogas anbudet (bilaga 4)."),
    attachment("Bilaga 2", "Uppdragen ska redovisas i referensblanketten (bilaga 2).", 8),
    attachment("Genomförandebeskrivning", "Anbudsgivaren ska bifoga en genomförandebeskrivning på högst tre A4-sidor.", 11),
  ];

  it("lists an attachment named twice once, by what it is, with its number beside it, in the document's numbering", () => {
    const { required } = attachmentGroups(extracted);
    expect(required.map((item) => [item.name, item.number])).toEqual([
      ["Prisbilaga", "Bilaga 1"],
      ["Referensblankett", "Bilaga 2"],
      ["Sanningsförsäkran", "Bilaga 3"],
      ["Försäkringsbevis", "Bilaga 4"],
      ["Genomförandebeskrivning", null],
    ]);
    // The extraction's names stay, to match a review's verdicts and the ticks kept in the browser.
    expect(required[3]!.names).toEqual(["Bilaga 4", "Försäkringsbevis"]);
    expect(required[0]!.names).toEqual(["Bilaga 1"]);
    expect(required[0]!.key).toBe("0-bilaga 1");
  });

  it("names a number-only attachment from its quote only when the quote says what it is", () => {
    const { required } = attachmentGroups([
      attachment("Bilaga 5", "Arbetet utförs enligt arbetsmiljöplanen (bilaga 5)."),
      attachment("Bilaga 6", "Anbudet ska vara komplett (bilaga 6)."),
      attachment("Bilaga 7", "Se bilagan (bilaga 7)."),
      attachment("Bilaga 8", "Referenserna lämnas i bilaga 8."),
    ]);
    expect(required.map((item) => [item.name, item.number])).toEqual([
      ["Arbetsmiljöplan", "Bilaga 5"],
      ["Bilaga 6", null],
      ["Bilaga 7", null],
      ["Bilaga 8", null],
    ]);
  });

  it("puts the attachments needed only in some cases apart", () => {
    const { conditional } = attachmentGroups([
      ...extracted,
      attachment("Åtagande från ett annat företag", "Åtagande", 5, "Om ni använder ett annat företags kapacitet."),
    ]);
    expect(conditional.map((item) => item.name)).toEqual(["Intyg", "Åtagande från ett annat företag"]);
  });

  it("keeps two attachments apart when only their quotes mention the same number", () => {
    const { required } = attachmentGroups([
      attachment("Referensblankett", "Referenserna lämnas i bilaga 2."),
      attachment("Kontaktuppgifter", "Kontaktuppgifter fylls i på bilaga 2:s sista sida.", 9),
    ]);
    expect(required.map((item) => item.name)).toEqual(["Referensblankett", "Kontaktuppgifter"]);
  });
});

describe("evaluation", () => {
  const criterion = (name: string, weight: number | null, how = ""): EvaluationCriterion => ({
    name,
    weight_percent: weight,
    how_assessed: how,
    citation: cite(11, name),
  });

  it("splits a whole into shares and names them as one figure", () => {
    const evaluation = [criterion("Pris", 70), criterion("Kvalitet", 30)];
    expect(evaluationShares(evaluation)).toEqual([
      { name: "Pris", weight: 70 },
      { name: "Kvalitet", weight: 30 },
    ]);
    expect(evaluationFigure(evaluation)).toEqual({ value: "70/30", label: "pris/kvalitet" });
  });

  it("draws no shares that do not add up, and still gives a figure", () => {
    expect(evaluationShares([criterion("Pris", 70)])).toBeNull();
    expect(evaluationFigure([criterion("Pris", 70)])).toEqual({ value: "70 %", label: "pris" });
    expect(evaluationFigure([criterion("Pris", null), criterion("Kvalitet", null)])).toEqual({
      value: "2",
      label: "utvärderingskriterier",
    });
    expect(evaluationFigure([])).toBeNull();
  });

  it("drops a description that only repeats the heading", () => {
    expect(criterionDetail(criterion("Pris", 70, "Pris 70 % 70"))).toBeNull();
    expect(criterionDetail(criterion("Pris", 70, "Lägst pris får högst poäng."))).toBe("Lägst pris får högst poäng.");
  });
});

describe("key dates", () => {
  // As the rule-based extraction lists them for the demo document: ISO dates in the text, a period as two rows.
  const extracted = [
    date("annat", "2026-10-01", "Datum 2026-10-01", 1),
    date("sista_anbudsdag", "2026-11-09", "Sista anbudsdag 2026-11-09 kl. 23.59", 1),
    date("annat", "2026-10-15", "Frivilligt platsbesök 2026-10-15 kl. 14.00"),
    date("fragestopp", "2026-10-30", "Sista dag för frågor 2026-10-30"),
    date("annat", "2026-11-03", "Sista dag för kommunens svar på frågor 2026-11-03"),
    date("annat", "2027-05-17", "Utvändig målning 2027-05-17 – 2027-06-25"),
    date("annat", "2027-06-25", "Utvändig målning 2027-05-17 – 2027-06-25"),
    date("anbudets_giltighet", "2027-02-07", "Anbudet ska vara giltigt till och med den 7 februari 2027.", 5),
  ];

  it("writes the text without the ISO date and with the time as kl. 14:00", () => {
    expect(cleanDateText("Frivilligt platsbesök 2026-10-15 kl. 14.00")).toBe("Frivilligt platsbesök kl. 14:00");
    expect(cleanDateText("Utvändig målning 2027-05-17 – 2027-06-25")).toBe("Utvändig målning");
    expect(cleanDateText("Uppdraget färdigställt senast 2027-08-13")).toBe("Uppdraget färdigställt senast");
    // A table's label before its date goes with the date; a "datum" of the sentence stays.
    expect(cleanDateText("Förfarande Öppet förfarande enligt 6 kap. 2 § LOU Datum 2026-09-21")).toBe(
      "Förfarande Öppet förfarande enligt 6 kap. 2 § LOU",
    );
    expect(cleanDateText("Sista datum för frågor 2026-10-30")).toBe("Sista datum för frågor");
  });

  it("splits at sista anbudsdag, in date order, with a period as one row", () => {
    const { before, after } = dateGroups(withDates(extracted), "2026-11-09");
    expect(before.map((row) => [row.from, row.text])).toEqual([
      ["2026-10-01", "Datum i underlaget"],
      ["2026-10-15", "Frivilligt platsbesök kl. 14:00"],
      ["2026-10-30", "Sista dag för frågor"],
      ["2026-11-03", "Sista dag för kommunens svar på frågor"],
      ["2026-11-09", "Sista anbudsdag kl. 23:59"],
    ]);
    expect(after.map((row) => [row.from, row.to, row.text])).toEqual([
      ["2027-02-07", null, "Anbudets giltighetstid"],
      ["2027-05-17", "2027-06-25", "Utvändig målning"],
    ]);
    expect(after[0]!.detail).toBe("Anbudet ska vara giltigt till och med den 7 februari 2027.");
  });

  it("marks the rows the backend reminds about: the first dated entry of each kind", () => {
    const dates = [
      date("fragestopp", "2026-10-30", "Sista dag för frågor 2026-10-30"),
      date("fragestopp", "2026-10-13", "Anmälan via frågefunktionen senast 2026-10-13"),
      ...extracted.slice(1, 2),
    ];
    const { before } = dateGroups(withDates(dates), "2026-11-09");
    expect(before.map((row) => [row.from, row.reminder])).toEqual([
      ["2026-10-13", null],
      ["2026-10-30", "fragestopp"],
      ["2026-11-09", "sista_anbudsdag"],
    ]);
  });

  it("keeps everything before the tender when the deadline is unknown, and undated deadlines last", () => {
    const { before, after } = dateGroups(
      withDates([date("fragestopp", null, "Frågor ställs i e-Avrop."), extracted[5]!]),
      null,
    );
    expect(before.map((row) => [row.text, row.detail])).toEqual([
      ["Utvändig målning", null],
      ["Sista dag för frågor", "Frågor ställs i e-Avrop."],
    ]);
    expect(after).toEqual([]);
  });
});

describe("terms", () => {
  it("previews the first terms as a sentence", () => {
    const terms = ["sanningsförsäkran", "avtalsspärr", "F-skatt"].map((term) => ({ term, explanation: "", citation: null }));
    expect(termPreview(terms)).toBe("Sanningsförsäkran, avtalsspärr, F-skatt.");
    expect(termPreview(terms, 2)).toBe("Sanningsförsäkran, avtalsspärr …");
    expect(termPreview([])).toBe("");
  });
});
