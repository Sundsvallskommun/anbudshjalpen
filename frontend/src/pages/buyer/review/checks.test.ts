import { describe, expect, it } from "vitest";
import type { Checklist } from "../../../api/types";
import { draftChecklistView } from "../../../test/fixtures";
import {
  answerHints,
  autoChecks,
  kindMismatches,
  needsCheck,
  rowHints,
  summaryIssue,
  summaryProblem,
  type CheckContext,
} from "./checks";
import { checklistRows } from "./rows";

const base: Checklist = draftChecklistView.checklist;
const NOTICE_DEADLINE = "2026-10-26T23:59:00+01:00";

function context(checklist: Checklist, headings: Record<string, string> = {}, noticeDeadline: string | null = NOTICE_DEADLINE): CheckContext {
  return { checklist, rows: checklistRows(checklist), noticeDeadline, headings: new Map(Object.entries(headings)) };
}

const deadline = (date: string): Checklist => ({
  ...base,
  dates: [
    ...base.dates,
    {
      kind: "sista_anbudsdag",
      date,
      description: "Anbud lämnas i e-Avrop.",
      citation: { page: 2, quote: "Sista anbudsdag", check: "verified", found_page: null, document: null, document_id: null },
    },
  ],
});

describe("the deadline check", () => {
  it("offers to add sista anbudsdag from the notice when the checklist lacks it", () => {
    const check = autoChecks(context(base)).find((item) => item.id === "deadline");
    expect(check).toMatchObject({
      tone: "warning",
      text: "Checklistan saknar sista anbudsdag. Annonsen anger 26 oktober 2026.",
      action: { label: "Lägg till", target: { kind: "add", section: "date", date: { kind: "sista_anbudsdag", date: "2026-10-26" } } },
    });
  });

  it("points at the date row when the checklist says another day than the notice", () => {
    const checklist = deadline("2026-10-22");
    const check = autoChecks(context(checklist)).find((item) => item.id === "deadline");
    expect(check?.tone).toBe("warning");
    expect(check?.text).toBe("Sista anbudsdag i checklistan, 22 oktober 2026, stämmer inte med annonsen, 26 oktober 2026.");
    const row = checklistRows(checklist).find((item) => item.item.section === "date" && item.index === 1)!;
    expect(check?.action?.target).toEqual({ kind: "edit", key: row.key });
    expect(rowHints(row, context(checklist), new Map())).toEqual(["Annonsen anger 26 oktober 2026"]);
  });

  it("confirms an agreeing deadline and stays quiet without one in the notice", () => {
    expect(autoChecks(context(deadline("2026-10-26")))[0]).toMatchObject({ id: "deadline", tone: "ok" });
    expect(autoChecks(context(base, {}, null)).some((item) => item.id === "deadline")).toBe(false);
  });
});

describe("the deadline check of a restricted procedure", () => {
  const request = (checklist: Checklist): CheckContext => ({ ...context(checklist), noticeDeadlineKind: "request" });

  it("does not offer the notice's date, which is the last day for anbudsansökan", () => {
    const check = autoChecks(request(base)).find((item) => item.id === "deadline");
    expect(check).toMatchObject({ tone: "warning" });
    expect(check?.text).toContain("Annonsen anger bara sista dag för anbudsansökan, 26 oktober 2026.");
    expect(check?.action).toBeUndefined();
  });

  it("flags sista anbudsdag on the same day as anbudsansökan, and accepts a later one from the document", () => {
    const same = autoChecks(request(deadline("2026-10-26"))).find((item) => item.id === "deadline");
    expect(same).toMatchObject({ tone: "warning", action: { label: "Ändra" } });
    const later = autoChecks(request(deadline("2026-12-01"))).find((item) => item.id === "deadline");
    expect(later).toMatchObject({ tone: "ok" });
    expect(later?.text).toContain("Sista anbudsdag i checklistan, 1 december 2026, kommer från underlaget.");
  });
});

describe("the other checks", () => {
  it("asks for evaluation criteria when there are none", () => {
    const check = autoChecks(context({ ...base, evaluation: [] })).find((item) => item.id === "evaluation");
    expect(check).toMatchObject({ tone: "warning", action: { label: "Lägg till", target: { kind: "add", section: "evaluation" } } });
  });

  it("compares kinds with headings only once a heading is known", () => {
    expect(autoChecks(context(base)).some((item) => item.id === "kinds")).toBe(false);
    expect(autoChecks(context(base, { K2: "2 Kvalificering" })).find((item) => item.id === "kinds")?.tone).toBe("ok");
    // The count is a word, so it is not read together with the heading's number, which stays on its line.
    const wrong = autoChecks(context(base, { K1: "2 Kvalificering" })).find((item) => item.id === "kinds");
    expect(wrong?.text).toBe("Ett krav under rubriken 2\u00a0Kvalificering är tolkat som Skallkrav.");
    expect(wrong?.action?.target).toEqual({ kind: "toCheck" });
    const allSkallkrav: Checklist = {
      ...base,
      requirements: base.requirements.map((requirement) => ({ ...requirement, kind: "skallkrav" })),
    };
    const both = autoChecks(context(allSkallkrav, { K1: "2 Kvalificering", K2: "2 Kvalificering" })).find(
      (item) => item.id === "kinds",
    );
    expect(both?.text).toBe("Två krav under rubriken 2\u00a0Kvalificering är tolkade som Skallkrav.");
  });

  it("names where the document describes the evaluation when the checklist has no criteria, and adds one from there", () => {
    const withSection: CheckContext = {
      ...context({ ...base, evaluation: [] }),
      evaluationSection: { heading: "4 Utvärdering", page: 6 },
    };
    expect(autoChecks(withSection).find((item) => item.id === "evaluation")).toMatchObject({
      tone: "warning",
      text: "Inga utvärderingskriterier hittades, men underlaget har kapitlet 4\u00a0Utvärdering på sida\u00a06.",
      action: { label: "Lägg till", target: { kind: "add", section: "evaluation", page: 6 } },
    });
  });

  it("counts sources to look at: not found, or on another page than the AI gave", () => {
    const check = autoChecks(context(base)).find((item) => item.id === "sources");
    expect(check?.text).toBe("2 källhänvisningar behöver kontrolleras: 1 hittades inte och 1 står på en annan sida än AI:n angav.");
  });

  it("puts what is wrong with the summary in a word for its row", () => {
    expect(summaryIssue("Underlaget har 8 sidor. Listan har 28 krav.")?.label).toBe("Skriv om");
    expect(summaryIssue("")?.label).toBe("Saknas");
    expect(summaryIssue(base.summary)).toBeNull();
  });

  it("asks for the buyer's own summary instead of the engine's wording", () => {
    expect(summaryProblem("Underlaget har 17 sidor. Listan har 58 krav, 7 bilagor och 14 datum.")).toBe(
      "Sammanfattningen är skriven av motorn. Skriv om den för företagen.",
    );
    expect(summaryProblem("Automatisk sammanställning utan språkmodell: underlaget har 8 sidor.")).not.toBeNull();
    expect(summaryProblem(" ")).toBe("Sammanfattningen saknas. Skriv 2–4 meningar för företagen.");
    expect(summaryProblem(base.summary)).toBeNull();
  });
});

describe("rows to check", () => {
  it("marks rows whose source deviates and rows a check points at", () => {
    const current = context(base, { K1: "2 Kvalificering" });
    const mismatches = kindMismatches(current);
    const flagged = current.rows
      .filter((row) => needsCheck(row, rowHints(row, current, mismatches)))
      .map((row) => row.key);
    expect(flagged).toEqual(["krav:K1", "krav:K2", "bilaga:Prisbilaga"]);
    expect(rowHints(current.rows[0]!, current, mismatches)).toEqual(["Står under 2 Kvalificering"]);
  });
});

describe("quotes of inköp's published answers (decision 0018)", () => {
  const quote = { answer: 2, quote: "Ja, det minskar med 25 % per poäng.", found_answer: null, answer_key: "k2" } as const;

  it("flags a quote that was not found or stands in another answer, and counts it among the sources", () => {
    expect(answerHints({ ...quote, check: "verified" })).toEqual([]);
    expect(answerHints({ ...quote, check: "moved", found_answer: 4 })).toEqual(["Citatet ur inköps svar står i fråga 4, inte 2"]);
    expect(answerHints({ ...quote, check: "unverified" })).toEqual(["Citatet ur inköps svar hittades inte"]);

    const [first, ...rest] = base.requirements;
    const checklist = { ...base, requirements: [{ ...first!, answer_citation: { ...quote, check: "unverified" as const } }, ...rest] };
    const current = context(checklist);
    const row = current.rows.find((item) => item.key === "krav:K1")!;
    expect(needsCheck(row, rowHints(row, current, kindMismatches(current)))).toBe(true);
    expect(autoChecks(current).find((item) => item.id === "sources")?.text).toBe(
      "3 källhänvisningar behöver kontrolleras: 1 hittades inte, 1 står på en annan sida än AI:n angav och 1 ur inköps svar stämmer inte.",
    );
  });
});
