import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDetail } from "../../../../api/types";
import { companyUser, NOTICE_ID, noticeDetail, publishedAnswer } from "../../../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../../../test/render";
import { paragraphsOf } from "../../../../components/ui/PublishedAnswerQuote";

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

describe("Frågor och svar från inköp (decisions 0013 and 0018)", () => {
  const later = {
    ...publishedAnswer,
    key: "b".repeat(64),
    question: "Gäller kravet på F-skatt även underleverantörer?",
    answer: "Ja.\nDet gäller alla som utför arbete i uppdraget.",
    answered_at: "2026-10-02T09:00:00+02:00",
  };

  it("sets each answer apart from its question, numbered and dated, open from the start", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ published_answers: [publishedAnswer, later] })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const trigger = await screen.findByRole("button", { name: "Frågor och svar från inköp, 2 frågor" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Frågor och svar från inköp" });
    const [first, second] = within(list).getAllByRole("listitem");
    if (!first || !second) throw new Error("expected two answers");
    expect(first).toHaveAttribute("id", `svar-${"a".repeat(12)}`);
    expect(within(first).getByText("Fråga 1 · Besvarad 30 sep")).toBeInTheDocument();
    expect(within(first).getByText("Ska ställning ingå i priset för fasadmålningen?")).toBeInTheDocument();
    // The answer says that it is the answer, in words.
    expect(within(first).getByText("Svar från inköp")).toBeInTheDocument();
    expect(within(first).getByText("Ja, ställning ingår i anbudspriset. Prisbilagan är uppdaterad.")).toBeInTheDocument();
    expect(within(second).getByText("Fråga 2 · Besvarad 2 okt")).toBeInTheDocument();
    // A single line break in the log is not a paragraph.
    expect(within(second).getByText("Ja. Det gäller alla som utför arbete i uppdraget.")).toBeInTheDocument();
    // It is in the outline; the reader's own questions go to the floating "Fråga AI" button, and the step leads on.
    expect(screen.getByRole("link", { name: "Frågor och svar från inköp (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fråga AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Granska utkastet" })).toBeInTheDocument();
    // Few answers need no search field.
    expect(screen.queryByRole("textbox", { name: "Sök bland frågorna och svaren" })).not.toBeInTheDocument();
  });

  it("offers a search field for a long list, in the question and the answer", async () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      ...publishedAnswer,
      key: `${index}`.repeat(64),
      question: index === 4 ? "Hur beräknas påslaget?" : `Fråga om leveransen nummer ${index + 1}?`,
      answer: index === 2 ? "Påslaget gäller inte här." : "Se förfrågningsunderlaget.",
    }));
    mockApi([...baseRoutes(companyUser), noticeWith({ published_answers: many })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.type(await screen.findByRole("textbox", { name: "Sök bland frågorna och svaren" }), "påslag");
    const list = screen.getByRole("list", { name: "Frågor och svar från inköp" });
    expect(within(list).getAllByRole("listitem").map((item) => within(item).getByText(/^Fråga \d/u).textContent)).toEqual([
      "Fråga 3 · Besvarad 30 sep",
      "Fråga 5 · Besvarad 30 sep",
    ]);
    expect(screen.getByText("2 frågor av 6 innehåller det du sökte på.")).toBeInTheDocument();
  });

  it("is shown under the card of a notice without a checklist", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ checklist: null, checklist_status: "none", published_answers: [publishedAnswer] })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("list", { name: "Frågor och svar från inköp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fråga underlaget" })).toBeInTheDocument();
  });

  it("shows nothing when the buyer has published no answers", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith()]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await screen.findByRole("button", { name: "Granska utkastet" });
    expect(screen.queryByRole("list", { name: "Frågor och svar från inköp" })).not.toBeInTheDocument();
  });

  it("splits a log's text into paragraphs and joins single line breaks", () => {
    expect(paragraphsOf("Ja.\nStällning ingår.\n\n\nPrisbilagan är uppdaterad. \n")).toEqual([
      "Ja. Ställning ingår.",
      "Prisbilagan är uppdaterad.",
    ]);
    expect(paragraphsOf("")).toEqual([]);
  });
});
