import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDetail } from "../../../../api/types";
import { companyUser, NOTICE_ID, noticeDetail, publishedAnswer } from "../../../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../../../test/render";
import { paragraphsOf } from "./PublishedAnswers";

function noticeWith(changes: Partial<NoticeDetail> = {}): MockRoute {
  return { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, ...changes } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Published answers in step 1 (decision 0013)", () => {
  it("lists the buyer's answers with their number and date, open from the start", async () => {
    const later = {
      ...publishedAnswer,
      question: "Gäller kravet på F-skatt även underleverantörer?",
      answer: "Ja.\nDet gäller alla som utför arbete i uppdraget.",
      answered_at: "2026-10-02T09:00:00+02:00",
    };
    mockApi([...baseRoutes(companyUser), noticeWith({ published_answers: [publishedAnswer, later] })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const trigger = await screen.findByRole("button", { name: "Svar inköp har publicerat i e-Avrop, 2 svar" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Publicerade frågor och svar" });
    const [first, second] = within(list).getAllByRole("listitem");
    if (!first || !second) throw new Error("expected two answers");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(first).toHaveTextContent("Fråga 1 · besvarad 30 sep");
    expect(first).toHaveTextContent("Ska ställning ingå i priset för fasadmålningen?");
    expect(first).toHaveTextContent("Ja, ställning ingår i anbudspriset. Prisbilagan är uppdaterad.");
    expect(second).toHaveTextContent("Fråga 2 · besvarad 2 okt");
    // A single line break in the log is not a paragraph.
    expect(within(second).getByText("Ja. Det gäller alla som utför arbete i uppdraget.")).toBeInTheDocument();
    // The reader's own questions follow, in the "Fråga AI" panel.
    expect(screen.getByRole("button", { name: "Ställ en fråga" })).toBeInTheDocument();
  });

  it("is shown under the card of a notice without a checklist", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ checklist: null, checklist_status: "none", published_answers: [publishedAnswer] })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("list", { name: "Publicerade frågor och svar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fråga underlaget" })).toBeInTheDocument();
  });

  it("shows nothing when the buyer has published no answers", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith()]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await screen.findByRole("button", { name: "Ställ en fråga" });
    expect(screen.queryByRole("list", { name: "Publicerade frågor och svar" })).not.toBeInTheDocument();
  });

  it("splits a log's text into paragraphs and joins single line breaks", () => {
    expect(paragraphsOf("Ja.\nStällning ingår.\n\n\nPrisbilagan är uppdaterad. \n")).toEqual([
      "Ja. Ställning ingår.",
      "Prisbilagan är uppdaterad.",
    ]);
    expect(paragraphsOf("")).toEqual([]);
  });
});
