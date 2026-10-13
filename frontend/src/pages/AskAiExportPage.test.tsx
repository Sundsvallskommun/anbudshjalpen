import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerView } from "../api/types";
import { STORAGE_KEY, type Turn } from "../components/ask/askAiState";
import { answerNotInDocument, companyUser, NOTICE_ID, noticeDetail, publishedAnswer } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";
import { answerCitationLine, citationLine } from "./AskAiExportPage";

const answerInDocument: AnswerView = {
  ...answerNotInDocument,
  answer: {
    answer: "Ni behöver en ansvarsförsäkring på minst 5 miljoner kronor. Försäkringsbeviset ska bifogas anbudet.",
    found_in_document: true,
    citations: [{ page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null, document: null, document_id: null }],
    answer_citations: [],
    suggest_formal_question: false,
  },
};

function storeConversation(key: string, turns: Turn[]) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ [key]: turns }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("The conversation as a document (decision 0014)", () => {
  it("prints the questions and answers about a notice, with the quotes and their pages", async () => {
    storeConversation(`notice:${NOTICE_ID}`, [
      { id: 1, question: "Vilka försäkringar måste vi ha?", answer: answerInDocument, rules: null, error: null },
      { id: 2, question: "Får vi arbeta på helger?", answer: answerNotInDocument, rules: null, error: null },
    ]);
    mockApi([...baseRoutes(companyUser), { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail }]);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderApp(`/fraga-ai/utskrift?amne=${encodeURIComponent(`notice:${NOTICE_ID}`)}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Frågor och svar" })).toBeInTheDocument();
    expect(await screen.findByText(noticeDetail.title)).toBeInTheDocument();
    expect(screen.getByText(/^Från Anbudshjälpen 5 okt/u)).toHaveTextContent("inte granskade av inköp");
    const first = screen.getByRole("heading", { level: 2, name: "Fråga 1" }).closest("li");
    const second = screen.getByRole("heading", { level: 2, name: "Fråga 2" }).closest("li");
    if (!first || !second) throw new Error("expected two questions");
    expect(first).toHaveTextContent("Vilka försäkringar måste vi ha?");
    expect(first).toHaveTextContent("Ni behöver en ansvarsförsäkring på minst 5 miljoner kronor.");
    expect(first).toHaveTextContent("”Leverantören ska ha en ansvarsförsäkring” (s. 4)");
    expect(first).toHaveTextContent("Svar, regelbaserad motor, inte granskat av inköp");
    // An answer the document did not settle carries the line about the formal question.
    expect(second).toHaveTextContent("Ställ frågan i e-Avrop senast 16 oktober – då får alla leverantörer samma svar.");
    // The frame is not here: nothing but the document and its two buttons.
    expect(screen.queryByRole("navigation", { name: "Huvudmeny" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Skriv ut eller spara som PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("says when there is nothing to print", async () => {
    mockApi([...baseRoutes(companyUser)]);
    renderApp("/fraga-ai/utskrift?amne=rules");

    expect(await screen.findByText("Det finns inga frågor och svar att skriva ut. Ställ en fråga i Fråga AI först.")).toBeInTheDocument();
    expect(screen.getByText("Reglerna för offentlig upphandling")).toBeInTheDocument();
  });

  it("words a citation's page by what the check found", () => {
    const base = { quote: "x", page: 5, found_page: null, document: null, document_id: null } as const;
    expect(citationLine({ ...base, check: "verified" })).toBe("s. 5");
    expect(citationLine({ ...base, check: "moved", found_page: 6 })).toBe("s. 6 (AI angav 5)");
    expect(citationLine({ ...base, check: "unverified" })).toBe("s. 5, hittades inte i underlaget");
    const documents = [
      { id: "a", filename: "Föreskrifter.pdf", page_count: 10, empty_pages: 0, is_fictitious: true },
      { id: "b", filename: "Bilaga 6.6 Krav.pdf", page_count: 3, empty_pages: 0, is_fictitious: true },
    ];
    expect(citationLine({ ...base, check: "verified", document_id: "b" }, documents)).toBe("s. 5 · Bilaga 6.6 Krav.pdf");
  });

  it("words a quote of inköp's answer by its entry, or that it was not found (decision 0018)", () => {
    const quote = { answer: 1, quote: "Ja.", found_answer: null, answer_key: publishedAnswer.key } as const;
    expect(answerCitationLine({ ...quote, check: "verified" }, [publishedAnswer])).toBe(
      "inköps svar i e-Avrop, fråga 1 · besvarad 30 sep",
    );
    expect(answerCitationLine({ ...quote, check: "unverified" }, [publishedAnswer])).toBe("hittades inte bland inköps svar");
    expect(answerCitationLine({ ...quote, check: "verified" }, [])).toBe("hittades inte bland inköps svar");
  });
});
