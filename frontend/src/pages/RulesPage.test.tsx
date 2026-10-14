import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { RuleSource, RulesView } from "../api/types";
import { renderWithProviders } from "../components/ui/testing";
import { session } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";
import RulesPage from "./RulesPage";

const QUESTION = "Hur lång är avtalsspärren?";
const SESSION_ID = "4b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";

const spärr: RuleSource = {
  title: "Avtalsspärr",
  reference: "LOU 20 kap. 1 §",
  url: "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K20P1",
  excerpt:
    "Om underrättelsen om tilldelningsbeslut har skickats med ett elektroniskt medel får den upphandlande " +
    "myndigheten inte ingå avtal förrän 10 dagar har gått från det att underrättelsen skickades. …",
  kind: "law",
  note: null,
};
const förlängd: RuleSource = {
  title: "Förlängd avtalsspärr",
  reference: "LOU 20 kap. 8 §",
  url: "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K20P8",
  excerpt: "Om en ansökan om överprövning har gjorts, fortsätter avtalsspärren att gälla under handläggningen.",
  kind: "law",
  note: null,
};
// A section of the municipality's procurement strategy (decision 0022): the backend labels it with a note.
const konkurrens: RuleSource = {
  title: "Konkurrensinriktade inköp",
  reference: "Inköpsstrategin 5.3",
  url: "https://sundsvall.se/download/strategi.pdf#page=9",
  excerpt: "Sundsvalls kommuns inköp ska tillvarata och vårda konkurrensen på de olika marknaderna. …",
  kind: "policy",
  note: "Kommunens styrdokument, fastställt av kommunfullmäktige 2023-09-25.",
};
const STRATEGY_QUESTION = "Hur ser kommunen på småföretag?";
const strategyAnswer: RulesView = {
  answer: {
    answer: [
      "Paragrafer och avsnitt som kan handla om din fråga:",
      `${konkurrens.reference} – ${konkurrens.title}: ${konkurrens.excerpt}`,
      `${spärr.reference} – ${spärr.title}: ${spärr.excerpt}`,
    ].join("\n\n"),
    sources: [konkurrens, spärr],
    session_id: null,
  },
  engine: "heuristic",
};

/** The rule-based engine's answer, worded as the backend writes it: an introduction, then each paragraph again. */
const heuristicAnswer: RulesView = {
  answer: {
    answer: [
      "Paragrafer som kan handla om din fråga:",
      `${spärr.reference} – ${spärr.title}: ${spärr.excerpt}`,
      `${förlängd.reference} – ${förlängd.title}: ${förlängd.excerpt}`,
    ].join("\n\n"),
    sources: [spärr, förlängd],
    session_id: null,
  },
  engine: "heuristic",
};

const LEAD = "Avtalsspärren är 10 dagar om underrättelsen skickas elektroniskt, annars 15 dagar.";
const modelAnswer: RulesView = {
  answer: {
    answer: `${LEAD} Under tiden får avtalet inte tecknas.\n\n- Spärren börjar när underrättelsen skickas.\n- Den förlängs vid överprövning.`,
    sources: [spärr],
    session_id: SESSION_ID,
  },
  engine: "eneo",
};

function rulesRoute(answers: RulesView[]) {
  let call = 0;
  return {
    method: "POST" as const,
    path: "/api/rules/ask",
    body: () => answers[Math.min(call++, answers.length - 1)],
  };
}

describe("RulesPage", () => {
  it("answers in a thread, with each paragraph once as a card that links to the whole law text", async () => {
    const calls = mockApi([...baseRoutes(null), rulesRoute([heuristicAnswer])]);
    renderApp("/regelhjalpen");

    expect(await screen.findByRole("heading", { level: 1, name: "Regelhjälpen" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Din fråga" }), QUESTION);
    await userEvent.click(screen.getByRole("button", { name: "Fråga" }));

    expect(await screen.findByRole("heading", { level: 2, name: `Din fråga: ${QUESTION}` })).toBeInTheDocument();
    const answer = await screen.findByRole("article", { name: `Svar på: ${QUESTION}`, busy: false });
    // Without a conclusion the engine's own introduction opens the answer, as the heading over the cards.
    const paragraphs = within(answer).getByRole("list", { name: "Paragrafer som kan handla om din fråga" });
    expect(within(answer).getByRole("heading", { level: 3, name: "Paragrafer som kan handla om din fråga" })).toBeInTheDocument();
    expect(within(answer).getByText("Automatiskt framtaget")).toBeInTheDocument();
    expect(within(paragraphs).getByRole("heading", { level: 4, name: "LOU 20 kap. 1 § · Avtalsspärr" })).toBeInTheDocument();
    expect(within(answer).getAllByText(/förrän 10 dagar har gått/)).toHaveLength(1);
    expect(within(answer).getByRole("link", { name: /^Läs hela paragrafen LOU 20 kap\. 8 §/ })).toHaveAttribute(
      "href",
      förlängd.url,
    );

    expect(calls.find((call) => call.path === "/api/rules/ask")?.body).toEqual({ question: QUESTION, session_id: null });
    expect(screen.getByRole("textbox", { name: "Din fråga" })).toHaveValue("");
    expect(screen.getByText(`Regelhjälpen har svarat på ”${QUESTION}”.`)).toBeInTheDocument();
  });

  it("opens a model's answer with its conclusion, keeps the examples and continues the conversation", async () => {
    const calls = mockApi([...baseRoutes(null), rulesRoute([modelAnswer, modelAnswer])]);
    renderApp("/regelhjalpen");

    await userEvent.click(await screen.findByRole("button", { name: QUESTION }));
    const answer = await screen.findByRole("article", { name: `Svar på: ${QUESTION}`, busy: false });
    expect(within(answer).getByText(LEAD)).toBeInTheDocument();
    // The explanation's list is drawn by the Markdown renderer, which is fetched with the first such answer.
    expect(await within(answer).findByText("Spärren börjar när underrättelsen skickas.")).toBeInTheDocument();
    expect(within(answer).getByRole("heading", { level: 3, name: "Svaret bygger på" })).toBeInTheDocument();
    // The other examples stay; the one just asked is not offered again.
    const examples = screen.getByRole("list", { name: "Fler frågor du kan ställa" });
    expect(within(examples).getByRole("button", { name: "Vad är en direktupphandling?" })).toBeInTheDocument();
    expect(within(examples).queryByRole("button", { name: QUESTION })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "Din fråga" }), "Och vid direktupphandling?");
    await userEvent.click(screen.getByRole("button", { name: "Fråga" }));
    await screen.findByRole("heading", { level: 2, name: "Din fråga: Och vid direktupphandling?" });
    const asked = calls.filter((call) => call.path === "/api/rules/ask");
    expect(asked[1]?.body).toEqual({ question: "Och vid direktupphandling?", session_id: SESSION_ID });
  });

  it("shows a section of the municipality's strategy as a steering document, never as law", async () => {
    mockApi([...baseRoutes(null), rulesRoute([strategyAnswer])]);
    renderApp("/regelhjalpen");

    expect(await screen.findByRole("heading", { level: 1, name: "Regelhjälpen" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Din fråga" }), STRATEGY_QUESTION);
    await userEvent.click(screen.getByRole("button", { name: "Fråga" }));

    const answer = await screen.findByRole("article", { name: `Svar på: ${STRATEGY_QUESTION}`, busy: false });
    const sources = within(answer).getByRole("list", { name: "Paragrafer och avsnitt som kan handla om din fråga" });
    const items = within(sources).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [strategy, law] = items as [HTMLElement, HTMLElement];
    expect(within(strategy).getByRole("heading", { level: 4, name: "Inköpsstrategin 5.3 · Konkurrensinriktade inköp" })).toBeInTheDocument();
    expect(within(strategy).getByText("Kommunens styrdokument, fastställt av kommunfullmäktige 2023-09-25.")).toBeInTheDocument();
    expect(within(strategy).getByRole("link", { name: /^Läs hela avsnittet Inköpsstrategin 5\.3/ })).toHaveAttribute(
      "href",
      konkurrens.url,
    );
    expect(within(law).getByRole("link", { name: /^Läs hela paragrafen LOU 20 kap\. 1 §/ })).toBeInTheDocument();
    expect(within(law).queryByText(/styrdokument/)).not.toBeInTheDocument();
  });

  it("explains in the provenance popover that the answer rests on the law, not on procurement documents", async () => {
    mockApi([...baseRoutes(null), rulesRoute([heuristicAnswer])]);
    renderApp("/regelhjalpen");

    await userEvent.click(await screen.findByRole("button", { name: QUESTION }));
    const answer = await screen.findByRole("article", { name: `Svar på: ${QUESTION}`, busy: false });
    expect(within(answer).getByText("inte granskat av inköp ·")).toBeInTheDocument();
    await userEvent.click(within(answer).getByRole("button", { name: "Hur togs svaret fram?" }));

    const popover = await screen.findByRole("dialog", { name: "Hur togs svaret fram?" });
    expect(within(popover).getByText(/Regelhjälpen letar upp paragrafer i lagen om offentlig upphandling/)).toBeInTheDocument();
    expect(within(popover).getByText("Det är alltid lagtexten som gäller.")).toBeInTheDocument();
    expect(within(popover).queryByText(/underlaget/)).not.toBeInTheDocument();
  });

  it("checks the question when it is sent instead of disabling the button", async () => {
    const calls = mockApi([...baseRoutes(null), rulesRoute([heuristicAnswer])]);
    renderApp("/regelhjalpen");

    await userEvent.click(await screen.findByRole("button", { name: "Fråga" }));
    const field = screen.getByRole("textbox", { name: "Din fråga" });
    expect(screen.getByText("Skriv en fråga på minst tre tecken")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    expect(calls.some((call) => call.path === "/api/rules/ask")).toBe(false);

    await userEvent.type(field, "Vad är ESPD?");
    expect(field).not.toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the question in the field when it cannot be answered", async () => {
    mockApi([
      ...baseRoutes(null),
      { method: "POST", path: "/api/rules/ask", status: 503, body: { detail: "Regelhjälpen svarar inte just nu." } },
    ]);
    renderApp("/regelhjalpen");

    await userEvent.type(await screen.findByRole("textbox", { name: "Din fråga" }), QUESTION);
    await userEvent.click(screen.getByRole("button", { name: "Fråga" }));

    expect(await screen.findByText("Frågan kunde inte besvaras")).toBeInTheDocument();
    expect(screen.getByText("Regelhjälpen svarar inte just nu.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Din fråga" })).toHaveValue(QUESTION);
    expect(screen.queryByRole("heading", { level: 2, name: `Din fråga: ${QUESTION}` })).not.toBeInTheDocument();
  });

  it("starts over with an empty thread and the writing field in focus", async () => {
    mockApi([...baseRoutes(null), rulesRoute([heuristicAnswer])]);
    renderApp("/regelhjalpen");

    await userEvent.click(await screen.findByRole("button", { name: QUESTION }));
    await screen.findByRole("article", { name: `Svar på: ${QUESTION}`, busy: false });
    await userEvent.click(screen.getByRole("button", { name: "Börja om" }));

    expect(screen.queryByRole("list", { name: "Dina frågor och svaren" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Din fråga" })).toHaveFocus();
    expect(screen.getByRole("heading", { level: 2, name: "Exempel på frågor" })).toBeInTheDocument();
  });

  it("asks a question from the address on arrival and leaves the address clean", async () => {
    const calls = mockApi([{ method: "GET", path: "/api/session", body: session(null) }, rulesRoute([heuristicAnswer])]);
    renderWithProviders(<RulesPage />, { path: `/regelhjalpen?fraga=${encodeURIComponent(QUESTION)}` });

    expect(await screen.findByRole("article", { name: `Svar på: ${QUESTION}`, busy: false })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/regelhjalpen$/);
    expect(calls.filter((call) => call.path === "/api/rules/ask")).toHaveLength(1);
  });
});
