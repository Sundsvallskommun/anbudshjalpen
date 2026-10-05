import { describe, expect, it } from "vitest";
import type { KeyDate, NoticeDetail } from "../../api/types";
import { checklistView, draftChecklistView, noticeDetail } from "../../test/fixtures";
import { answerDocumentId, checklistDate, primaryDocumentId, reminderDeadline } from "./noticeData";

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
