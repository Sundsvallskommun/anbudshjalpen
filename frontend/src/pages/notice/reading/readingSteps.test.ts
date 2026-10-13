import { describe, expect, it } from "vitest";
import type { ChecklistProgress, DocumentReading, NoticeDetail, ReadingReport } from "../../../api/types";
import { formatNumber } from "../../../lib/format";
import { checklistView, noticeDetail, publishedAnswer, readingReport } from "../../../test/fixtures";
import {
  CHECKLIST_TITLE,
  formatLabel,
  MAIN_MARK,
  NOTICE_TITLE,
  readingGroups,
  REPLACED_MARK,
  stepTime,
  UNREAD_TITLE,
} from "./readingSteps";

const NOW = new Date("2026-10-05T10:00:00+02:00");

function document(changes: Partial<DocumentReading>): DocumentReading {
  return { ...readingReport.documents[0]!, ...changes };
}

function report(changes: Partial<ReadingReport>): ReadingReport {
  return { ...readingReport, ...changes };
}

function texts(groups: ReturnType<typeof readingGroups>, title: string): string[] {
  return groups.find((group) => group.title === title)!.steps.map((step) => step.text);
}

describe("readingSteps", () => {
  it("writes a step's time as a short date with the clock, in Swedish time", () => {
    expect(stepTime("2026-09-21T06:30:00+02:00", NOW)).toBe("21 sep kl. 06:30");
    expect(stepTime("2025-12-01T00:00:00+01:00", NOW)).toBe("1 dec 2025");
  });

  it("names a file's format in the reader's words", () => {
    expect(formatLabel("application/pdf")).toBe("PDF");
    expect(formatLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Word");
    expect(formatLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("Excel");
    expect(formatLabel("image/tiff")).toBe("image/tiff");
  });

  it("traces the notice, each file and the checklist, in that order", () => {
    const groups = readingGroups(readingReport, noticeDetail, NOW);
    expect(groups.map((group) => group.title)).toEqual([NOTICE_TITLE, "Förfrågningsunderlag Solbacken.pdf", CHECKLIST_TITLE]);
    expect(texts(groups, NOTICE_TITLE)).toEqual(["Påhittad upphandling, inlagd som demodata"]);
    const file = groups[1]!;
    expect(file.marks).toEqual([MAIN_MARK]);
    expect(file.steps.map((step) => [step.at, step.text, step.tone])).toEqual([
      ["2026-09-21T06:30:00+02:00", "Lades in som demodata · PDF, 1,2 MB", "neutral"],
      ["2026-09-21T06:30:00+02:00", `Texten togs ut (textuttag version 3): 16 sidor, ${formatNumber(42_000)} tecken`, "neutral"],
      [null, "Huvuddokument: tolkas till checklistan, tillsammans med de övriga dokumenten", "neutral"],
    ]);
    expect(texts(groups, CHECKLIST_TITLE)).toEqual([
      "Tolkades till ett utkast till checklista (regelbaserad motor)",
      "3 av 4 källhänvisningar hittades i underlaget · 1 på en annan sida än AI:n angav · 1 hittades inte och behöver kontrolleras",
      "Granskades och godkändes av inköp",
      "Publicerades för företagen",
    ]);
  });

  it("says what the interpretation read, and when answers from inköp can change the list", () => {
    const read = { documents_read: 2, documents_total: 3, pages_read: 40, pages_total: 52 };
    const notice: NoticeDetail = {
      ...noticeDetail,
      checklist: { ...checklistView, model: "gpt-4.1", reviewed: false, verification: { ...checklistView.verification, read } },
      published_answers: [publishedAnswer, { ...publishedAnswer, key: "2", answered_at: "2026-10-08T09:00:00+02:00" }],
    };
    const steps = readingGroups(readingReport, notice, NOW).find((group) => group.title === CHECKLIST_TITLE)!.steps;
    expect(steps[0]!.text).toBe("Tolkades till ett utkast till checklista (regelbaserad motor, gpt-4.1)");
    expect(steps[1]).toEqual({
      at: checklistView.created_at,
      text: "Tolkningen läste 2 av 3 dokument och 40 av 52 sidor. Resten rymdes inte",
      tone: "warning",
    });
    expect(steps.at(-2)!.text).toBe("Publicerades utan inköps granskning");
    // The answers came after the publication, so they are the last step.
    expect(steps.at(-1)).toEqual({
      at: "2026-10-08T09:00:00+02:00",
      text: "2 svar från inköp hämtade från e-Avrop. Ändras svaren tolkas checklistan om",
      tone: "neutral",
    });
  });

  it("follows a file from e-Avrop through the export's footer, its empty pages and an older extraction", () => {
    const scanned = document({
      origin: "eavrop",
      layout: "eavrop",
      empty_pages: 3,
      extraction_version: 2,
      characters: 160_000,
      stored_at: "2026-10-01T06:30:00+02:00",
    });
    const groups = readingGroups(
      report({ source: "eavrop", documents: [scanned], updated_at: "2026-10-02T06:30:00+02:00" }),
      noticeDetail,
      NOW,
    );
    expect(texts(groups, NOTICE_TITLE)).toEqual([
      "Annonsen hämtades från e-Avrop",
      "Uppgifterna uppdaterades senast från källan",
    ]);
    const steps = groups[1]!.steps;
    // What happened in time order first, then the facts without a time of their own.
    expect(steps.map((step) => step.text)).toEqual([
      "Hämtades från e-Avrop · PDF, 1,2 MB",
      `Texten togs ut (textuttag version 2): 16 sidor, ${formatNumber(160_000)} tecken`,
      "Kändes igen som en export ur e-Avrop: sidfoten togs bort från varje sida, och formulärfälten (Ja, Svar, Kommentar, Ingen fil bifogad) räknas inte som text i underlaget",
      "Läst med en äldre version av textuttaget (2, nu 3). Läses om automatiskt",
      "3 sidor utan läsbar text, troligen inskannade. AI:n såg dem inte",
      "Huvuddokument: tolkas till checklistan, tillsammans med de övriga dokumenten",
      `Större än en tolkning rymmer (${formatNumber(150_000)} tecken). Ingen checklista förrän underlaget delas upp`,
    ]);
    expect(steps.map((step) => step.tone)).toEqual(["neutral", "neutral", "good", "warning", "warning", "neutral", "warning"]);
  });

  it("marks a replaced version, an unpacked attachment, an upload and the files that were not read", () => {
    const old = document({ id: "old", stored_at: "2026-09-20T06:30:00+02:00", superseded_by: DOC, superseded_at: "2026-09-21T06:30:00+02:00" });
    const member = document({
      id: "member",
      filename: "11.4 Ritningar.zip › plan.pdf",
      origin: "archive",
      archive: "11.4 Ritningar.zip",
      is_main: false,
      page_count: 2,
      characters: 0,
    });
    const upload = document({
      id: "upload",
      filename: "Bilaga 3.docx",
      origin: "upload",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size_bytes: 348_160,
      is_main: false,
      page_count: 4,
      characters: 9_000,
    });
    const groups = readingGroups(
      report({
        documents: [old, readingReport.documents[0]!, member, upload],
        unread_files: [{ filename: "Foto entré.jpg", reason: "Filformatet .jpg stöds inte" }],
      }),
      noticeDetail,
      NOW,
    );
    expect(groups[1]!.marks).toEqual([MAIN_MARK, REPLACED_MARK]);
    expect(groups[1]!.steps.at(-1)).toEqual({
      at: "2026-09-21T06:30:00+02:00",
      text: "Ersattes av en nyare fil med samma namn från källan. Den här versionen läses inte längre, men gamla källhänvisningar fungerar",
      tone: "neutral",
    });
    expect(groups[3]!.marks).toEqual([]);
    expect(groups[3]!.steps.map((step) => step.text)).toEqual([
      "Packades upp ur 11.4 Ritningar.zip · PDF, 1,2 MB",
      "Ingen text kunde tas ut ur filen",
      "Bilaga: läses med i tolkningen, i Fråga AI och i sökningen",
    ]);
    expect(groups[4]!.steps[0]!.text).toBe("Laddades upp av inköp · Word, 340 kB");
    expect(texts(groups, UNREAD_TITLE)).toEqual(["Foto entré.jpg · Filformatet .jpg stöds inte"]);
    expect(groups.at(-1)!.title).toBe(CHECKLIST_TITLE);
  });

  it("says where a checklist on its way is, and that none is shown otherwise", () => {
    const progress: ChecklistProgress = { state: "running", attempts: 0, max_attempts: 5, retry_at: null, next_run_at: null, last_run_at: null };
    const coming = readingGroups(readingReport, { ...noticeDetail, checklist: null, checklist_progress: progress }, NOW);
    expect(texts(coming, CHECKLIST_TITLE)).toEqual(["Tolkning pågår. Tar oftast under en minut."]);
    const none = readingGroups(readingReport, { ...noticeDetail, checklist: null, checklist_progress: null }, NOW);
    expect(texts(none, CHECKLIST_TITLE)).toEqual(["Ingen checklista visas för den här upphandlingen ännu"]);
    const draft = readingGroups(readingReport, { ...noticeDetail, checklist: { ...checklistView, status: "draft", approved_at: null, published_at: null } }, NOW);
    expect(texts(draft, CHECKLIST_TITLE).at(-1)).toBe("Utkast som väntar på inköps granskning");
  });
});

const DOC = readingReport.documents[0]!.id;
