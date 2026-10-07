import { describe, expect, it } from "vitest";
import type { KeyDate, NoticeDetail } from "../../api/types";
import { checklistView, draftChecklistView, noticeDetail } from "../../test/fixtures";
import {
  answerDocumentId,
  checklistDate,
  cpvNames,
  noticeMeta,
  primaryDocumentId,
  procedureFact,
  questionDeadlineDate,
  reminderDeadline,
  requirementTitles,
  tenderDeadlineDate,
} from "./noticeData";

function dated(kind: KeyDate["kind"], date: string | null): KeyDate {
  return { kind, date, description: "", citation: { page: 1, quote: "Datum", check: "verified", found_page: null } };
}

function withDates(dates: KeyDate[], view = checklistView, changes: Partial<NoticeDetail> = {}): NoticeDetail {
  return { ...noticeDetail, ...changes, checklist: { ...view, checklist: { ...view.checklist, dates } } };
}

describe("key dates", () => {
  it("takes the first dated entry of a kind, as the backend does, not the earliest", () => {
    const notice = withDates([dated("fragestopp", null), dated("fragestopp", "2026-10-30"), dated("fragestopp", "2026-10-13")]);
    expect(checklistDate(notice, "fragestopp")).toBe("2026-10-30");
    expect(reminderDeadline(notice, "fragestopp")).toBe("2026-10-30");
  });

  it("reminds only from a published checklist, with the notice's deadline as the fallback for sista anbudsdag", () => {
    const draft = withDates([dated("fragestopp", "2026-10-30")], draftChecklistView, {
      deadline_at: "2026-11-09T22:59:00Z",
    });
    expect(reminderDeadline(draft, "fragestopp")).toBeNull();
    expect(reminderDeadline(draft, "sista_anbudsdag")).toBe("2026-11-09");

    const published = withDates([dated("sista_anbudsdag", "2026-11-06")], checklistView, {
      deadline_at: "2026-11-09T22:59:00Z",
    });
    expect(reminderDeadline(published, "sista_anbudsdag")).toBe("2026-11-06");
    expect(reminderDeadline({ ...published, checklist: null, deadline_at: null }, "sista_anbudsdag")).toBeNull();
  });

  it("reads sista anbudsdag and frågestopp as calendar dates in Swedish time", () => {
    // 23:59 Swedish time on 9 November is 22:59 UTC: still the 9th.
    expect(tenderDeadlineDate({ ...noticeDetail, deadline_at: "2026-11-09T22:59:00Z" })).toBe("2026-11-09");
    expect(tenderDeadlineDate(withDates([dated("sista_anbudsdag", "2026-11-06")], checklistView, { deadline_at: null }))).toBe(
      "2026-11-06",
    );
    expect(questionDeadlineDate({ question_deadline: "2026-10-16T23:59:59+02:00" })).toBe("2026-10-16");
    expect(questionDeadlineDate({ question_deadline: null })).toBeNull();
  });

  it("keeps a restricted procedure's last day for anbudsansökan apart from sista anbudsdag", () => {
    const request = { deadline_at: "2026-10-30T22:59:59Z", deadline_kind: "request" as const };
    const withoutDate = withDates([dated("fragestopp", "2026-10-20")], checklistView, request);
    expect(reminderDeadline(withoutDate, "anbudsansokan")).toBe("2026-10-30");
    expect(reminderDeadline(withoutDate, "sista_anbudsdag")).toBeNull();
    expect(tenderDeadlineDate(withoutDate)).toBeNull();

    const withDate = withDates([dated("sista_anbudsdag", "2026-12-01")], checklistView, request);
    expect(reminderDeadline(withDate, "sista_anbudsdag")).toBe("2026-12-01");
    expect(reminderDeadline(withDate, "anbudsansokan")).toBe("2026-10-30");
    expect(tenderDeadlineDate(withDate)).toBe("2026-12-01");
    // A notice whose deadline is for tenders has no anbudsansökan to remind about.
    expect(reminderDeadline(noticeDetail, "anbudsansokan")).toBeNull();
  });
});

describe("documents", () => {
  it("cites answers from the first document and the checklist from its own", () => {
    const later = { ...noticeDetail.documents[0]!, id: "later", filename: "Bilaga.pdf" };
    const notice: NoticeDetail = {
      ...noticeDetail,
      documents: [...noticeDetail.documents, later],
      checklist: { ...checklistView, document_id: "later" },
    };
    expect(answerDocumentId(notice)).toBe(noticeDetail.documents[0]!.id);
    expect(primaryDocumentId(notice)).toBe("later");
  });
});

describe("header facts", () => {
  it("names who buys and the reference number, and where a real notice comes from, without saying Demo next to Fiktiv", () => {
    expect(noticeMeta(noticeDetail)).toBe("Sundsvalls kommun · DEMO-2026-0147");
    expect(noticeMeta({ buyer: "Mitthem AB", reference_number: " AB-2026-14 ", source: "ted" })).toBe("Mitthem AB · AB-2026-14 · TED");
    expect(noticeMeta({ buyer: "Mitthem AB", reference_number: null, source: "ted" })).toBe("Mitthem AB · TED");
    expect(noticeMeta({ buyer: null, reference_number: null, source: "fixture" })).toBe("");
  });

  it("knows the titles of the requirements step 1 lists, for the fit reasons that link to them", () => {
    expect(requirementTitles(noticeDetail).get("K2")).toBe("Två referensuppdrag");
    expect(requirementTitles({ checklist: null }).size).toBe(0);
  });

  it("names CPV codes by their labels and leaves out the ones the list does not name", () => {
    expect(
      cpvNames({ cpv_codes: ["45442100", "45442110", "99999999"], cpv_labels: { "45442100": "Målning", "45442110": "Målning av byggnader" } }),
    ).toEqual(["Målning", "Målning av byggnader"]);
  });

  it("says the procedure in plain words, with the law below", () => {
    expect(procedureFact("Annonserad upphandling under tröskelvärdena enligt 19 kap. LOU")).toEqual({
      label: "Under EU:s beloppsgränser",
      detail: "19 kap. LOU",
    });
    expect(procedureFact("Öppet förfarande (6 kap. 2 § LOU), ramavtal med en leverantör")).toEqual({
      label: "Öppet förfarande",
      detail: "6 kap. 2 § LOU · ramavtal med en leverantör",
    });
    expect(procedureFact("Selektivt förfarande")).toEqual({ label: "Selektivt förfarande", detail: null });
    expect(procedureFact(null)).toBeNull();
  });
});
