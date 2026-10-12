import { describe, expect, it } from "vitest";
import type { ReviewView } from "../../../../api/types";
import { checklistView, reviewView } from "../../../../test/fixtures";
import { knownValues, reviewedValues, submitGroups } from "./submitModel";

describe("submitGroups", () => {
  it("lists the skall- and kvalificeringskrav and the attachments, unreviewed without a review", () => {
    const groups = submitGroups(checklistView.checklist, null);
    expect(groups.requirements).toEqual([
      {
        value: "krav:K1",
        label: "Ansvarsförsäkring om minst 5 miljoner kronor",
        description: "Bevis: Bifoga försäkringsbevis.",
        review: null,
      },
      { value: "krav:K2", label: "Två referensuppdrag", description: null, review: null },
    ]);
    // The quote ("Bilaga 1 Prisbilaga") gives the attachment's number.
    expect(groups.attachments.map((item) => [item.label, item.review])).toEqual([["Prisbilaga (bilaga 1)", null]]);
    expect(reviewedValues(groups)).toEqual([]);
  });

  it("ticks what the review found and flags what it did not", () => {
    const groups = submitGroups(checklistView.checklist, reviewView);
    expect(groups.requirements.map((item) => [item.value, item.review])).toEqual([
      ["krav:K1", "obevisat"],
      ["krav:K2", "uppfyllt"],
    ]);
    expect(groups.attachments[0]!.review).toBe("saknas");
    expect(reviewedValues(groups)).toEqual(["krav:K2"]);
  });

  it("counts an attachment as attached when the review found it under any of its names", () => {
    const review: ReviewView = {
      ...reviewView,
      result: { ...reviewView.result, attachments: [{ name: "Prisbilaga", status: "bifogad", comment: "" }] },
    };
    expect(reviewedValues(submitGroups(checklistView.checklist, review))).toEqual(["krav:K2", expect.stringMatching(/^bilaga:/u)]);
  });

  it("flags no gap for an attachment needed only in some cases, but ticks it when the draft has it", () => {
    const intyg = {
      name: "Intyg",
      description: null,
      citation: { page: 7, quote: "Anbudsgivare som är etablerade i Sverige behöver därför inte bifoga intyg om detta.", check: "verified" as const, found_page: null, document: null, document_id: null },
    };
    const checklist = { ...checklistView.checklist, attachments: [...checklistView.checklist.attachments, intyg] };
    const missing: ReviewView = { ...reviewView, result: { ...reviewView.result, attachments: [{ name: "Intyg", status: "saknas", comment: "" }] } };
    const conditional = submitGroups(checklist, missing).attachments.find((item) => item.label === "Intyg")!;
    expect([conditional.description, conditional.review]).toEqual(["Bara i vissa fall", null]);
    const attached: ReviewView = { ...reviewView, result: { ...reviewView.result, attachments: [{ name: "Intyg", status: "bifogad", comment: "" }] } };
    expect(submitGroups(checklist, attached).attachments.find((item) => item.label === "Intyg")!.review).toBe("uppfyllt");
  });

  it("forgets ticks for items the checklist no longer has", () => {
    const groups = submitGroups(checklistView.checklist, null);
    expect(knownValues(groups, ["krav:K1", "krav:K99"])).toEqual(["krav:K1"]);
  });
});
