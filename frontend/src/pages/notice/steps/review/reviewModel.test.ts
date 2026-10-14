import { describe, expect, it } from "vitest";
import type { Checklist, Requirement, RequirementCheck, ReviewView } from "../../../../api/types";
import { checklistView, reviewView } from "../../../../test/fixtures";
import { attachmentCheckFor, attachedCount, attachmentVerdicts, draftSource, questionAbout, reviewGroups, reviewVerdict } from "./reviewModel";

function requirement(id: string, kind: Requirement["kind"], title: string): Requirement {
  return { id, kind, title, plain_language: title, evidence: null, citation: { page: 5, quote: title, check: "verified", found_page: null, document: null, document_id: null } };
}

function check(requirementId: string, status: RequirementCheck["status"], comment = "Kommentar."): RequirementCheck {
  return { requirement_id: requirementId, status, comment, draft_quote: null, draft_page: null, draft_document: null, draft_check: null };
}

const checklist: Checklist = {
  ...checklistView.checklist,
  requirements: [
    requirement("K1", "skallkrav", "Anbudet är skrivet på svenska"),
    requirement("K2", "kvalificeringskrav", "Två referensuppdrag"),
    requirement("K3", "kvalificeringskrav", "Ansvarsförsäkring"),
    requirement("K4", "skallkrav", "Alla bilagor ska vara med"),
    requirement("K5", "krav_pa_uppdraget", "Fasaden målas med linoljefärg"),
    requirement("K6", "avtalsvillkor", "Vite vid försening"),
  ],
};

function view(checks: RequirementCheck[]): ReviewView {
  return { ...reviewView, result: { ...reviewView.result, checks } };
}

describe("reviewGroups", () => {
  it("groups skall- and kvalificeringskrav by what to do, and the rest by kind whatever their status", () => {
    const groups = reviewGroups(
      view([
        check("K1", "uppfyllt"),
        check("K3", "obevisat"),
        check("K2", "saknas"),
        check("K4", "oklart"),
        check("K5", "saknas"),
        check("K6", "uppfyllt"),
      ]),
      checklist,
    );
    expect(groups.map((group) => [group.id, group.items.map((item) => item.check.requirement_id)])).toEqual([
      ["atgarda", ["K2", "K3"]],
      ["kontrollera", ["K4"]],
      ["bra", ["K1"]],
      ["uppdraget", ["K5"]],
      ["villkor", ["K6"]],
    ]);
    expect(groups.map((group) => group.defaultOpen)).toEqual([true, false, false, false, false]);
  });

  it("says a comment every row shares once, as the group's text", () => {
    const groups = reviewGroups(
      view([check("K2", "saknas", "Hittade inget i utkastet."), check("K3", "saknas", "Hittade inget i utkastet.")]),
      checklist,
    );
    expect(groups[0]!.helper).toBe("Hittade inget i utkastet.");
    expect(reviewGroups(view([check("K1", "uppfyllt", "A."), check("K4", "uppfyllt", "B.")]), checklist)[2]!.helper).toBe(
      "Till exempel: Anbudet är skrivet på svenska · Alla bilagor ska vara med.",
    );
  });

  it("keeps a check whose requirement the checklist no longer has, under its title from the review", () => {
    const [atgarda] = reviewGroups(view([check("K9", "saknas")]), checklist);
    expect(atgarda!.items[0]!.title).toBe("K9");
    expect(reviewGroups(reviewView, checklistView.checklist)[0]!.items[0]!.title).toBe("Ansvarsförsäkring om minst 5 miljoner kronor");
  });
});

describe("reviewVerdict", () => {
  it("leads with what must be fixed, then with what to check, else says it looks good", () => {
    const verdict = reviewVerdict(reviewGroups(view([check("K2", "saknas"), check("K3", "obevisat"), check("K1", "uppfyllt")]), checklist));
    expect(verdict).toEqual({ title: "2 saker bör åtgärdas innan du lämnar anbudet", mustFix: 2, good: 1, essential: 3, others: 0 });
    expect(reviewVerdict(reviewGroups(view([check("K4", "oklart")]), checklist)).title).toBe(
      "Inget verkar behöva åtgärdas, men 1 krav bör du kontrollera själv",
    );
    expect(reviewVerdict(reviewGroups(view([check("K1", "uppfyllt")]), checklist)).title).toBe(
      "Skall- och kvalificeringskraven ser bra ut",
    );
  });
});

describe("attachments", () => {
  it("counts what the draft has and finds an attachment's check by any of its names", () => {
    const checks = [
      { name: "Bilaga 4", status: "saknas" as const, comment: "" },
      { name: "Försäkringsbevis", status: "bifogad" as const, comment: "" },
    ];
    expect(attachedCount(checks)).toEqual({ attached: 1, total: 2 });
    expect(attachmentCheckFor(["Bilaga 4", "Försäkringsbevis"], checks)?.status).toBe("bifogad");
    expect(attachmentCheckFor(["Prisbilaga"], checks)).toBeNull();
  });

  it("gives one verdict per attachment to hand in, named as step 1 names it, and none for the ones needed only sometimes", () => {
    const cite = (quote: string) => ({ page: 7, quote, check: "verified" as const, found_page: null, document: null, document_id: null });
    const attachments = [
      { name: "Bilaga 3", description: null, citation: cite("Underteckna sanningsförsäkran (bilaga 3) och lämna den med anbudet.") },
      { name: "Intyg", description: null, citation: cite("Anbudsgivare som är etablerade i Sverige behöver därför inte bifoga intyg om detta.") },
      { name: "Bilaga 4", description: null, citation: cite("Försäkringsbevis ska bifogas anbudet (bilaga 4).") },
      { name: "Försäkringsbevis", description: null, citation: cite("Försäkringsbevis ska bifogas anbudet (bilaga 4).") },
    ];
    const checks = [
      { name: "Bilaga 3", status: "bifogad" as const, comment: "" },
      { name: "Intyg", status: "saknas" as const, comment: "" },
      { name: "Bilaga 4", status: "oklart" as const, comment: "" },
      { name: "Försäkringsbevis", status: "oklart" as const, comment: "" },
      { name: "Okänd bilaga", status: "saknas" as const, comment: "" },
    ];
    const verdicts = attachmentVerdicts(attachments, checks);
    expect(verdicts).toEqual([
      { name: "Sanningsförsäkran", status: "bifogad" },
      { name: "Försäkringsbevis", status: "oklart" },
      { name: "Okänd bilaga", status: "saknas" },
    ]);
    expect(attachedCount(verdicts)).toEqual({ attached: 1, total: 3 });
  });

  it("puts a question about a requirement in the reader's words", () => {
    expect(questionAbout("Två referensuppdrag.")).toBe("Hur visar jag att vi uppfyller kravet ”Två referensuppdrag”?");
  });
});

describe("draftSource", () => {
  it("names the file when the draft has several, and the page when there is one", () => {
    expect(draftSource({ draft_document: null, draft_page: 2 })).toBe("Ur ditt utkast, s. 2");
    expect(draftSource({ draft_document: null, draft_page: null })).toBe("Ur ditt utkast");
    expect(draftSource({ draft_document: "forsakringsbevis.pdf", draft_page: 1 })).toBe("Ur forsakringsbevis.pdf, s. 1");
    expect(draftSource({ draft_document: "forsakringsbevis.pdf", draft_page: null })).toBe("Ur forsakringsbevis.pdf");
  });
});
