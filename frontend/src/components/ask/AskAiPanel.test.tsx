import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerView, AskView, RulesView } from "../../api/types";
import {
  answerNotInDocument,
  companyUser,
  config,
  NOTICE_ID,
  noticeBuyers,
  noticeDetail,
  noticeList,
  profileChatView,
  publishedAnswer,
  session,
} from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../test/render";
import { READY_TEXT } from "./AskAiPanel";
import { hasBeenWelcomed, markWelcomed, STORAGE_KEY, VISITOR, WELCOMED_KEY } from "./askAiState";

const ASK = "/api/ask";

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

const rulesView: RulesView = {
  answer: {
    answer: "Avtalsspärren är tio dagar när tilldelningsbeslutet skickas elektroniskt.",
    sources: [
      {
        title: "Avtalsspärr",
        reference: "LOU 20 kap. 1 §",
        url: "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K20P1",
        excerpt: "Om en upphandlande myndighet är skyldig att skicka en underrättelse om beslutet …",
        kind: "law",
        note: null,
      },
    ],
    session_id: null,
  },
  engine: "heuristic",
  tools: [
    { name: "sok_regeltexter", label: "Sök i LOU och styrdokumenten", detail: "1 träff" },
    { name: "sok_lou", label: "Sök i LOU", detail: null },
  ],
};

/** The backend's answer under the subject it picked (decision 0026). */
function fromDocuments(answer: AnswerView): AskView {
  return { subject: "underlag", decided_by: "rule", answer, rules: null, profile: null };
}
const fromRules: AskView = { subject: "regler", decided_by: "rule", answer: null, rules: rulesView, profile: null };
const fromProfile: AskView = { subject: "profil", decided_by: "rule", answer: null, rules: null, profile: profileChatView };

const noticeRoute: MockRoute = { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail };
const listRoutes: MockRoute[] = [
  { method: "GET", path: "/api/notices", body: noticeList },
  { method: "GET", path: "/api/notices/buyers", body: noticeBuyers },
];

/** Opens the panel once the page has loaded, so that a notice page's notice is already its subject. */
async function openPanel() {
  await screen.findByRole("heading", { level: 1 });
  await userEvent.click(await screen.findByRole("button", { name: "Fråga AI" }));
  return screen.findByRole("dialog", { name: "Fråga AI" });
}

async function ask(panel: HTMLElement, question: string) {
  await userEvent.type(within(panel).getByRole("textbox"), question);
  await userEvent.keyboard("{Enter}");
}

/** The answer to a question in the thread, once it has come (its article is there while it is on its way too). */
async function answerTo(panel: HTMLElement, question: string, lead: string) {
  const article = await within(panel).findByRole("article", { name: `Svar på ”${question}”` });
  await within(article).findByText(lead);
  return article;
}

const LEAD = "Ni behöver en ansvarsförsäkring på minst 5 miljoner kronor.";

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Fråga AI (decision 0014)", () => {
  it("opens from the button on a notice page, asks about the documents and shows the answer with its quotes", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, { method: "POST", path: ASK, body: fromDocuments(answerInDocument) }]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    // No choice of subject: the reader asks, and the app tells the documents from the rules (decision 0026).
    expect(within(panel).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(panel).getByText(noticeDetail.title)).toBeInTheDocument();
    expect(within(panel).getByText(/^Fråga om underlaget eller om reglerna/u)).toBeInTheDocument();
    await ask(panel, "Vilka försäkringar måste vi ha?");

    const answer = await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD);
    expect(within(answer).getByText("Står i underlaget")).toBeInTheDocument();
    expect(within(answer).queryByText(/^Allmänt om reglerna/u)).not.toBeInTheDocument();
    expect(within(answer).getByRole("link", { name: "Visa källan för ”Leverantören ska ha en ansvarsförsäkring”, s. 4" })).toBeInTheDocument();
    expect(calls.find((call) => call.path === ASK)?.body).toEqual({
      question: "Vilka försäkringar måste vi ha?",
      notice_id: NOTICE_ID,
      history: [],
      rules_session_id: null,
    });
    expect(within(panel).getByRole("textbox")).toHaveTextContent("");
  });

  it("puts inköp's published answer first when the answer rests on it (decision 0018)", async () => {
    const fromBuyer: AnswerView = {
      ...answerInDocument,
      answer: {
        ...answerInDocument.answer,
        answer: "Ja, ställningen ingår i anbudspriset enligt inköps svar i e-Avrop.",
        answer_citations: [{ answer: 1, quote: "Ja, ställning ingår i anbudspriset.", check: "verified", found_answer: null, answer_key: publishedAnswer.key }],
      },
    };
    mockApi([
      ...baseRoutes(companyUser),
      { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, published_answers: [publishedAnswer] } },
      { method: "POST", path: ASK, body: fromDocuments(fromBuyer) },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    await ask(panel, "Ingår ställning i priset?");
    const answer = await answerTo(panel, "Ingår ställning i priset?", "Ja, ställningen ingår i anbudspriset enligt inköps svar i e-Avrop.");
    expect(within(answer).getByText("Inköp har svarat")).toBeInTheDocument();
    expect(within(answer).queryByText("Står i underlaget")).not.toBeInTheDocument();
    expect(within(answer).getByText("Ja, ställning ingår i anbudspriset.")).toBeInTheDocument();
    expect(within(answer).getByRole("link", { name: "Frågor och svar från inköp, fråga 1" })).toBeInTheDocument();
  });

  it("shows an answer stored before decision 0018, which has no quotes of inköp's answers", async () => {
    const { answer_citations: _dropped, ...older } = answerInDocument.answer;
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [`notice:${NOTICE_ID}`]: [
          { id: 1, question: "Vilka försäkringar måste vi ha?", answer: { ...answerInDocument, answer: older }, rules: null, error: null },
        ],
      }),
    );
    mockApi([...baseRoutes(companyUser), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    const answer = await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD);
    expect(within(answer).getByText("Står i underlaget")).toBeInTheDocument();
  });

  it("keeps the conversation in this tab, shows it again on a new visit and sends it as history", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, { method: "POST", path: ASK, body: fromDocuments(answerInDocument) }]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);
    let panel = await openPanel();
    await ask(panel, "Vilka försäkringar måste vi ha?");
    await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}")[`notice:${NOTICE_ID}`]).toHaveLength(1);

    cleanup();
    renderApp(`/upphandlingar/${NOTICE_ID}`);
    panel = await openPanel();
    expect(await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD)).toBeInTheDocument();
    await ask(panel, "Hur stor ska den vara?");
    await answerTo(panel, "Hur stor ska den vara?", LEAD);
    const sent = calls.filter((call) => call.path === ASK).map((call) => call.body);
    expect(sent.at(-1)).toEqual({
      question: "Hur stor ska den vara?",
      notice_id: NOTICE_ID,
      history: [{ question: "Vilka försäkringar måste vi ha?", answer: answerInDocument.answer.answer, subject: "underlag" }],
      rules_session_id: null,
    });
  });

  it("asks about the rules outside a notice page, with the paragraphs the answer rests on", async () => {
    const calls = mockApi([...baseRoutes(companyUser), ...listRoutes, { method: "POST", path: ASK, body: fromRules }]);
    renderApp("/upphandlingar");

    const panel = await openPanel();
    // No notice here: the rules answer, and a signed-in company's profile is the other subject the app can pick.
    expect(within(panel).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(panel).getByText("Reglerna för upphandling och er profil")).toBeInTheDocument();
    // One of Regelhjälpen's example questions, with one press.
    await userEvent.click(within(panel).getByRole("button", { name: "Hur lång är avtalsspärren?" }));

    // The list page behind the panel is busy with its own requests, so the answer gets more time than usual.
    const answer = await screen.findByRole("article", { name: "Svar på: Hur lång är avtalsspärren?" }, { timeout: 4000 });
    expect(await within(answer).findByText("Avtalsspärren är tio dagar när tilldelningsbeslutet skickas elektroniskt.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(within(answer).getByText("LOU 20 kap. 1 § · Avtalsspärr")).toBeInTheDocument();
    expect(calls.find((call) => call.path === ASK)?.body).toEqual({ question: "Hur lång är avtalsspärren?", notice_id: null, history: [], rules_session_id: null });
  });

  it("answers a general question on a notice page about the rules, in the same conversation, and says so", async () => {
    const calls = mockApi([
      ...baseRoutes(companyUser),
      noticeRoute,
      { method: "POST", path: ASK, body: (body: unknown) => ((body as { question: string }).question.includes("avtalsspärren") ? fromRules : fromDocuments(answerInDocument)) },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    await ask(panel, "Vilka försäkringar måste vi ha?");
    await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD);
    await ask(panel, "Hur lång är avtalsspärren?");
    const answer = await within(panel).findByRole("article", { name: "Svar på: Hur lång är avtalsspärren?" });
    await within(answer).findByText("Avtalsspärren är tio dagar när tilldelningsbeslutet skickas elektroniskt.");
    expect(within(panel).getByText("Allmänt om reglerna, inte om just den här upphandlingen")).toBeInTheDocument();
    // Both answers stay in the notice page's conversation, and the next question carried the first as history.
    expect(within(panel).getByText("Vilka försäkringar måste vi ha?")).toBeInTheDocument();
    expect(within(panel).getByText("Står i underlaget")).toBeInTheDocument();
    const sent = calls.filter((call) => call.path === ASK).map((call) => call.body as { history: unknown[] });
    expect(sent.at(-1)?.history).toEqual([{ question: "Vilka försäkringar måste vi ha?", answer: answerInDocument.answer.answer, subject: "underlag" }]);
    expect(within(panel).getByRole("link", { name: "Spara som PDF" })).toHaveAttribute("href", `/fraga-ai/utskrift?amne=${encodeURIComponent(`notice:${NOTICE_ID}`)}`);
  });

  it("puts a question handed over in the address in the field and takes it out of the address", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute]);
    const question = "Hur visar jag att vi uppfyller kravet ”Två referensuppdrag”?";
    renderApp(`/upphandlingar/${NOTICE_ID}?fraga=${encodeURIComponent(question)}`);

    const panel = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(within(panel).getByRole("textbox")).toHaveTextContent(question);
  });

  it("says what is wrong when the question is too short, and keeps a failed question with a way to try again", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, { method: "POST", path: ASK, status: 503, body: { detail: "AI-tjänsten svarar inte just nu." } }]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    await ask(panel, "?");
    expect(await within(panel).findByText("Skriv en fråga på minst tre tecken.")).toBeInTheDocument();
    expect(calls.some((call) => call.path === ASK)).toBe(false);

    await userEvent.clear(within(panel).getByRole("textbox"));
    await ask(panel, "Vilka försäkringar måste vi ha?");
    const answer = await within(panel).findByRole("article", { name: "Svar på ”Vilka försäkringar måste vi ha?”" });
    expect(await within(answer).findByText("Frågan kunde inte besvaras")).toBeInTheDocument();
    // The server's reason, not a generic "Något gick fel".
    expect(within(answer).getByText("AI-tjänsten svarar inte just nu.")).toBeInTheDocument();
    expect(within(answer).getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("offers the example questions only until the first one is asked, and shows the question without a name over it", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, { method: "POST", path: ASK, body: fromDocuments(answerInDocument) }]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    const examples = await within(panel).findByRole("list", { name: "Exempel på frågor" });
    await userEvent.click(within(examples).getByRole("button", { name: "Vilka försäkringar måste vi ha?" }));
    await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD);

    expect(within(panel).queryByRole("list", { name: /frågor/u })).not.toBeInTheDocument();
    expect(within(panel).queryByText("Du")).not.toBeInTheDocument();
    expect(within(panel).getByText("Vilka försäkringar måste vi ha?")).toBeInTheDocument();
  });

  it("offers the print view and clearing once there is a conversation", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, { method: "POST", path: ASK, body: fromDocuments(answerInDocument) }]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    expect(within(panel).queryByRole("button", { name: "Rensa samtalet" })).not.toBeInTheDocument();
    await ask(panel, "Vilka försäkringar måste vi ha?");
    await answerTo(panel, "Vilka försäkringar måste vi ha?", LEAD);
    expect(within(panel).getByRole("link", { name: "Spara som PDF" })).toHaveAttribute(
      "href",
      `/fraga-ai/utskrift?amne=${encodeURIComponent(`notice:${NOTICE_ID}`)}`,
    );

    await userEvent.click(within(panel).getByRole("button", { name: "Rensa samtalet" }));
    expect(within(panel).queryByRole("article", { name: /^Svar på/u })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("opens compact with a small title, can be made larger, and keeps its size until the next time", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const panel = await openPanel();
    // An h2 in the outline, set at a panel's size.
    expect(within(panel).getByRole("heading", { level: 2, name: "Fråga AI" }).tagName).toBe("H5");
    await userEvent.click(within(panel).getByRole("button", { name: "Förstora panelen" }));
    expect(within(panel).getByRole("button", { name: "Förminska panelen" })).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: "Stäng" }));
    await userEvent.click(screen.getByRole("button", { name: "Fråga AI" }));
    const again = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(within(again).getByRole("button", { name: "Förminska panelen" })).toBeInTheDocument();
  });

  it("lists the tools an answer rested on, under the answer", async () => {
    mockApi([...baseRoutes(companyUser), ...listRoutes, { method: "POST", path: ASK, body: fromRules }]);
    renderApp("/upphandlingar");

    const panel = await openPanel();
    // The example with one press, as the rules test does: the busy list page behind the panel can lose typed keys.
    await userEvent.click(within(panel).getByRole("button", { name: "Hur lång är avtalsspärren?" }));
    const answer = await screen.findByRole("article", { name: "Svar på: Hur lång är avtalsspärren?" }, { timeout: 4000 });
    // Two tools fold into the design system's summary, the last one showing; opening it lists them all.
    const summary = await within(answer).findByRole("button", { name: /Sök i LOU/u, expanded: false }, { timeout: 4000 });
    await userEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(within(answer).getByText("Sök i LOU och styrdokumenten")).toBeInTheDocument();
    expect(within(answer).getByText("1 träff")).toBeInTheDocument();
  });

  it("lets a signed-in company change its profile by writing to the panel, and shows what changed (decision 0025)", async () => {
    const calls = mockApi([...baseRoutes(companyUser), ...listRoutes, { method: "POST", path: ASK, body: fromProfile }]);
    renderApp("/upphandlingar");

    const panel = await openPanel();
    expect(within(panel).getByText("Reglerna för upphandling och er profil")).toBeInTheDocument();
    expect(within(panel).getByText(/Skriv vad som ska ändras i er profil/u)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Vi har numera tolv anställda" }));

    const answer = await within(panel).findByRole("article", { name: "Svar på ”Vi har numera tolv anställda”" });
    expect(await within(answer).findByText("Jag uppdaterar antal anställda i er profil.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(within(answer).getByText("Ändring i er profil")).toBeInTheDocument();
    expect(within(answer).getByText("Sparat i profilen")).toBeInTheDocument();
    expect(within(answer).getByRole("link", { name: "Visa profilen" })).toHaveAttribute("href", "/profil");
    const changes = within(answer).getByRole("list", { name: "Det här ändrades" });
    expect(changes).toHaveTextContent("Antal anställda12Förut: 5");
    expect(within(answer).getByText("1 upphandling verkar passa er nu.")).toBeInTheDocument();
    // The tools fold into the design system's summary, the last one showing.
    expect(within(answer).getByRole("button", { name: /Spara profilen/u, expanded: false })).toBeInTheDocument();
    expect(calls.find((call) => call.path === ASK)?.body).toEqual({ question: "Vi har numera tolv anställda", notice_id: null, history: [], rules_session_id: null });
  });

  it("offers the profile's examples only to a signed-in company", async () => {
    mockApi([...baseRoutes(null), ...listRoutes]);
    renderApp("/upphandlingar");

    const panel = await openPanel();
    expect(within(panel).getByText("Reglerna för offentlig upphandling")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Vi har numera tolv anställda" })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Skriv vad som ska ändras i er profil/u)).not.toBeInTheDocument();
  });
});

describe("Fråga AI's welcome", () => {
  beforeEach(() => {
    window.localStorage.removeItem(WELCOMED_KEY);
  });

  it("opens by itself the first time, says it is there through the whole process, and stays closed after that", async () => {
    mockApi([...baseRoutes(companyUser), ...listRoutes]);
    const { unmount } = renderApp("/upphandlingar");

    const panel = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(within(panel).getByText(/^Hej Anna! Jag är Anbudshjälpens AI-stöd\. Jag finns alltid här i hörnet/u)).toBeInTheDocument();
    expect(within(panel).getByText(READY_TEXT)).toBeInTheDocument();
    // Opening by itself takes no focus from the page.
    expect(panel).not.toContainElement(document.activeElement as HTMLElement);
    expect(hasBeenWelcomed(companyUser.id)).toBe(true);
    // The mark waves hello while the welcome is open, and stops once the reader has closed the panel.
    expect(panel.querySelector("[data-waving]")).not.toBeNull();
    await userEvent.click(within(panel).getByRole("button", { name: "Stäng" }));
    await userEvent.click(screen.getByRole("button", { name: "Fråga AI" }));
    const reopened = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(reopened.querySelector("[data-waving]")).toBeNull();
    unmount();

    mockApi([...baseRoutes(companyUser), ...listRoutes]);
    renderApp("/upphandlingar");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("dialog", { name: "Fråga AI" })).not.toBeInTheDocument();
  });

  it("welcomes each user once: a visitor, then the company after its login", async () => {
    markWelcomed(VISITOR);
    mockApi([...baseRoutes(companyUser), ...listRoutes]);
    renderApp("/upphandlingar");
    expect(await screen.findByRole("dialog", { name: "Fråga AI" })).toBeInTheDocument();
    expect(hasBeenWelcomed(companyUser.id)).toBe(true);
  });

  it("does not open behind the access code", async () => {
    mockApi([
      { method: "GET", path: "/api/config", body: { ...config, gate_required: true } },
      { method: "GET", path: "/api/session", body: session(null) },
    ]);
    renderApp("/upphandlingar");
    await screen.findByRole("heading", { level: 1, name: "Ange accesskoden" });
    expect(screen.queryByRole("dialog", { name: "Fråga AI" })).not.toBeInTheDocument();
    expect(hasBeenWelcomed(VISITOR)).toBe(false);
  });
});
