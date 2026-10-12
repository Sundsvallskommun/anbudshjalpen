import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerView, NoticeDetail } from "../../../../api/types";
import { answerNotInDocument, checklistView, companyUser, NOTICE_ID, noticeDetail, pageFour, reminder } from "../../../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../../../test/render";

const QUESTIONS = `/api/notices/${NOTICE_ID}/questions`;

const answerInDocument: AnswerView = {
  ...answerNotInDocument,
  answer: {
    answer: "Ni behöver en ansvarsförsäkring på minst 5 miljoner kronor. Försäkringsbeviset ska bifogas anbudet.",
    found_in_document: true,
    citations: [{ page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null, document: null, document_id: null }],
    suggest_formal_question: false,
  },
};

function noticeWith(changes: Partial<NoticeDetail> = {}): MockRoute {
  return { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, ...changes } };
}

async function ask(question: string) {
  await userEvent.type(await screen.findByRole("textbox", { name: /Din fråga/u }), question);
  await userEvent.click(screen.getByRole("button", { name: "Fråga" }));
}

function answerTo(question: string) {
  return screen.findByRole("article", { name: `Svar på ”${question}”` });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Step 2 Fråga", () => {
  it("names the file under a quote when the procurement has several documents", async () => {
    const attachment = { id: "9a9a9a9a-0000-4000-8000-000000000002", filename: "6.6 Krav på Entreprenör.pdf", page_count: 8, is_fictitious: true };
    const answer = {
      ...answerInDocument,
      read: { documents_read: 2, documents_total: 2, pages_read: 24, pages_total: 24 },
      answer: {
        ...answerInDocument.answer,
        citations: [{ ...answerInDocument.answer.citations[0]!, document: attachment.filename, document_id: attachment.id }],
      },
    };
    mockApi([
      ...baseRoutes(companyUser),
      noticeWith({ documents: [...noticeDetail.documents, attachment] }),
      { method: "POST", path: QUESTIONS, body: answer },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await ask("Vilka försäkringar måste vi ha?");
    const card = await answerTo("Vilka försäkringar måste vi ha?");

    const link = await within(card).findByRole("link", { name: /6\.6 Krav på Entreprenör\.pdf, s\. 4$/u });
    expect(link).toHaveAttribute("href", expect.stringContaining(`dokument=${attachment.id}`));
    expect(within(card).getByText("Svaret bygger på alla 2 dokument i underlaget.")).toBeInTheDocument();
  });

  it("answers in a thread: the question as the reader's bubble, then the lead and each quote with its page", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeWith(), { method: "POST", path: QUESTIONS, body: answerInDocument }]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await ask("Vilka försäkringar måste vi ha?");
    const answer = await answerTo("Vilka försäkringar måste vi ha?");
    const log = screen.getByRole("log", { name: "Frågor och svar" });
    expect(within(log).getByRole("article", { name: "Du" })).toHaveTextContent("Vilka försäkringar måste vi ha?");

    expect(await within(answer).findByText("Ni behöver en ansvarsförsäkring på minst 5 miljoner kronor.")).toBeInTheDocument();
    expect(within(answer).getByText("Försäkringsbeviset ska bifogas anbudet.")).toBeInTheDocument();
    expect(within(answer).getByText("Står i underlaget")).toBeInTheDocument();
    const quotes = within(answer).getByRole("list", { name: "Det här står i underlaget:" });
    expect(within(quotes).getByRole("link", { name: "Visa källan för ”Leverantören ska ha en ansvarsförsäkring”, Förfrågningsunderlag Solbacken.pdf, s. 4" })).toBeInTheDocument();
    expect(within(quotes).getByText(/^Källa:/)).toBeInTheDocument();
    // The document settles it, so only the short line about the formal question.
    expect(within(answer).getByText("Oklart? Ställ frågan i e-Avrop senast 16 okt.")).toBeInTheDocument();
    expect(within(answer).queryByText("Ger underlaget inget entydigt svar?")).not.toBeInTheDocument();
    expect(calls.find((call) => call.path === QUESTIONS)?.body).toEqual({ question: "Vilka försäkringar måste vi ha?", history: [] });
  });

  it("advises the formal question with the date and a reminder when the document does not answer", async () => {
    const calls = mockApi([
      ...baseRoutes(companyUser),
      noticeWith(),
      { method: "POST", path: QUESTIONS, body: answerNotInDocument },
      { method: "POST", path: `/api/notices/${NOTICE_ID}/reminders`, body: reminder },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await ask("Får vi arbeta på helger?");
    const answer = await answerTo("Får vi arbeta på helger?");
    expect(await within(answer).findByText("Ger underlaget inget entydigt svar?")).toBeInTheDocument();
    expect(within(answer).getByText("Ställ frågan i e-Avrop senast 16 oktober – då får alla leverantörer samma svar.")).toBeInTheDocument();
    // A made-up notice with a page of its own links there.
    expect(within(answer).getByRole("link", { name: /^Öppna annonsen/u })).toHaveAttribute("href", noticeDetail.documents_url);
    expect(within(answer).queryByText("Står i underlaget")).not.toBeInTheDocument();
    // Frågestopp is a date: no invented time of day.
    expect(within(answer).queryByText(/kl\. 00:00/u)).not.toBeInTheDocument();

    await userEvent.click(within(answer).getByRole("button", { name: "Påminn mig före sista dag för frågor 16 oktober 2026" }));
    expect(await within(answer).findByText("Påminnelse mejlas 14 okt")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST" && call.path.endsWith("/reminders"))?.body).toEqual({ kind: "fragestopp" });
  });

  it("sends the earlier turns with the next question, oldest first", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeWith(), { method: "POST", path: QUESTIONS, body: answerInDocument }]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await ask("Vilka försäkringar måste vi ha?");
    await answerTo("Vilka försäkringar måste vi ha?");
    await ask("Hur stor ska den vara?");
    await answerTo("Hur stor ska den vara?");
    const sent = calls.filter((call) => call.path === QUESTIONS).map((call) => call.body);
    expect(sent[1]).toEqual({
      question: "Hur stor ska den vara?",
      history: [{ question: "Vilka försäkringar måste vi ha?", answer: answerInDocument.answer.answer }],
    });
  });

  it("says what is wrong when the question is too short, instead of disabling the button", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeWith()]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await userEvent.click(await screen.findByRole("button", { name: "Fråga" }));
    // The field shows the error, and Astryx's live region says it too.
    expect(await screen.findAllByText("Skriv en fråga på minst tre tecken.")).not.toHaveLength(0);
    expect(calls.some((call) => call.path === QUESTIONS)).toBe(false);
  });

  it("asks an example question with one press and offers the rest", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith(), { method: "POST", path: QUESTIONS, body: answerInDocument }]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    const examples = await screen.findByRole("list", { name: "Exempel på frågor" });
    await userEvent.click(within(examples).getByRole("button", { name: "Hur viktigt är priset?" }));
    await answerTo("Hur viktigt är priset?");
    const more = screen.getByRole("list", { name: "Fler frågor du kan ställa" });
    expect(within(more).queryByRole("button", { name: "Hur viktigt är priset?" })).not.toBeInTheDocument();
  });

  it("keeps a question that failed, with a way to try again", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith(), { method: "POST", path: QUESTIONS, status: 503, body: { detail: "AI-tjänsten svarar inte just nu." } }]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await ask("Vilka försäkringar måste vi ha?");
    const answer = await answerTo("Vilka försäkringar måste vi ha?");
    expect(await within(answer).findByText("Frågan kunde inte besvaras")).toBeInTheDocument();
    expect(within(answer).getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("puts a question handed over in the address in the composer", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith()]);
    const question = "Hur visar jag att vi uppfyller kravet ”Två referensuppdrag”?";
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga&fraga=${encodeURIComponent(question)}`);

    expect(await screen.findByRole("textbox", { name: /Din fråga/u })).toHaveValue(question);
  });

  it("tells the frågestopp in the rail with a reminder, and when the answers come", async () => {
    const answersBy = { kind: "annat" as const, date: "2026-10-20", description: "Kommunen svarar på frågor senast 2026-10-20", citation: checklistView.checklist.dates[0]!.citation };
    mockApi([
      ...baseRoutes(companyUser),
      noticeWith({ checklist: { ...checklistView, checklist: { ...checklistView.checklist, dates: [...checklistView.checklist.dates, answersBy] } } }),
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    const rail = await screen.findByRole("complementary", { name: "Bra att veta om frågor" });
    expect(within(rail).getByText("Kommunen svarar senast")).toBeInTheDocument();
    expect(within(rail).getByText("20 okt")).toBeInTheDocument();
    expect(await within(rail).findByRole("button", { name: "Påminn mig före sista dag för frågor 16 oktober 2026" })).toBeInTheDocument();
  });

  it("offers no frågestopp reminder when the checklist gives no frågestopp", async () => {
    mockApi([
      ...baseRoutes(companyUser),
      noticeWith({ question_deadline: null }),
      { method: "POST", path: QUESTIONS, body: { ...answerNotInDocument, question_deadline: null } },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await ask("Får vi arbeta på helger?");
    const answer = await answerTo("Får vi arbeta på helger?");
    expect(await within(answer).findByText(/före sista dag för frågor – då får alla leverantörer samma svar/u)).toBeInTheDocument();
    expect(within(answer).queryByRole("button", { name: /^Påminn mig/u })).not.toBeInTheDocument();
  });
});

describe("Step 2 Fråga, links to e-Avrop", () => {
  async function askNotFound(notice: MockRoute, answer: AnswerView = answerNotInDocument) {
    mockApi([...baseRoutes(companyUser), notice, { method: "POST", path: QUESTIONS, body: answer }]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);
    await ask("Får vi arbeta på helger?");
    const article = await answerTo("Får vi arbeta på helger?");
    await within(article).findByText("Ger underlaget inget entydigt svar?");
    return article;
  }

  it("links to the procurement in e-Avrop, whichever of the notice's links goes there", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=fiktiv";
    const answer = await askNotFound(noticeWith({ url: "https://ted.europa.eu/sv/notice/-/detail/1-2026", documents_url: eavrop }));
    expect(within(answer).getByRole("link", { name: /Öppna upphandlingen i e-Avrop/u })).toHaveAttribute("href", eavrop);
  });

  it("does not call e-Avrop itself the procurement when the notice only has a TED page", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall";
    const answer = await askNotFound(noticeWith({ url: "https://ted.europa.eu/sv/notice/-/detail/1-2026", documents_url: null }), {
      ...answerNotInDocument,
      formal_question_url: eavrop,
    });
    expect(within(answer).getByRole("link", { name: /Gå till e-Avrop/u })).toHaveAttribute("href", eavrop);
    expect(within(answer).queryByRole("link", { name: /Öppna upphandlingen/u })).not.toBeInTheDocument();
  });

  it("says why a made-up notice cannot be found in e-Avrop, instead of linking there", async () => {
    const answer = await askNotFound(noticeWith({ url: null, documents_url: null }), {
      ...answerNotInDocument,
      formal_question_url: "https://www.e-avrop.com/sundsvall",
    });
    expect(within(answer).getByText("Den här upphandlingen är påhittad och finns inte i e-Avrop.")).toBeInTheDocument();
    expect(within(answer).queryByRole("link", { name: /e-Avrop/u })).not.toBeInTheDocument();
    // The reminder before frågestopp is still offered.
    expect(await within(answer).findByRole("button", { name: "Påminn mig före sista dag för frågor 16 oktober 2026" })).toBeInTheDocument();
  });
});

describe("Step 2 Fråga, documents", () => {
  const laterDocument = { id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a", filename: "Förfrågningsunderlag version 2.pdf", page_count: 18, is_fictitious: true };
  const twoDocuments = noticeWith({
    documents: [...noticeDetail.documents, laterDocument],
    checklist: { ...checklistView, document_id: laterDocument.id },
  });

  async function openQuote(answer: AnswerView, page: MockRoute) {
    mockApi([...baseRoutes(companyUser), twoDocuments, { method: "POST", path: QUESTIONS, body: answer }, page]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);
    await ask("Får vi arbeta på helger?");
    const article = await answerTo("Får vi arbeta på helger?");
    await userEvent.click(await within(article).findByRole("link", { name: /s\. 4$/u }));
    return screen.findByRole("dialog", { name: "Källan i underlaget" });
  }

  it("opens a quote in the document the answer names", async () => {
    const dialog = await openQuote(
      { ...answerNotInDocument, document_id: laterDocument.id },
      { method: "GET", path: `/api/notices/${NOTICE_ID}/documents/${laterDocument.id}/pages/4`, body: { ...pageFour, page_count: 18 } },
    );
    expect(within(dialog).getByText(laterDocument.filename)).toBeInTheDocument();
    expect(await within(dialog).findByText("Sida 4 av 18")).toBeInTheDocument();
  });

  it("opens a quote in the first document when the answer does not name one", async () => {
    const { document_id: _unnamed, ...withoutDocument } = answerNotInDocument;
    const dialog = await openQuote(withoutDocument as AnswerView, {
      method: "GET",
      path: `/api/notices/${NOTICE_ID}/documents/${noticeDetail.documents[0]!.id}/pages/4`,
      body: pageFour,
    });
    expect(within(dialog).getByText(noticeDetail.documents[0]!.filename)).toBeInTheDocument();
    expect(await within(dialog).findByText("Sida 4 av 16")).toBeInTheDocument();
  });
});
