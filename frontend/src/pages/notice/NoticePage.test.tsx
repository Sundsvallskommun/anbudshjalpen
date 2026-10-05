import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerView, Citation, KeyDate, NoticeDetail } from "../../api/types";
import {
  answerNotInDocument,
  checklistView,
  companyUser,
  config,
  DOCUMENT_ID,
  NOTICE_ID,
  noticeDetail,
  pageFour,
  reminder,
  reviewView,
} from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../test/render";

const noticeRoute: MockRoute = { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail };
const pageRoute: MockRoute = {
  method: "GET",
  path: `/api/notices/${NOTICE_ID}/documents/${DOCUMENT_ID}/pages/4`,
  body: pageFour,
};

function noticeWith(changes: Partial<NoticeDetail>): MockRoute {
  return { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, ...changes } };
}

function noticeWithCitation(citation: Citation): MockRoute {
  const [first, ...rest] = checklistView.checklist.requirements;
  const checklist = { ...checklistView.checklist, requirements: [{ ...first!, citation }, ...rest] };
  return noticeWith({ checklist: { ...checklistView, checklist } });
}

function dated(kind: KeyDate["kind"], date: string, quote: string): KeyDate {
  return { kind, date, description: quote, citation: { page: 2, quote, check: "verified", found_page: null } };
}

// Reminders are offered only for deadlines that have not passed; the tests run on a fixed day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NoticePage checklist", () => {
  it("groups requirements by kind and shows each citation's page and verification", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: noticeDetail.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Skallkrav (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Kvalificeringskrav (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sida 4, verifierat citat/ })).toBeInTheDocument();
    // The quote was found on page 6, not the page 5 the AI gave: the chip opens page 6.
    expect(screen.getByRole("button", { name: /^Sida 6, hittat på annan sida/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sida 12, kunde inte kontrolleras/ })).toBeInTheDocument();
    expect(screen.getByText(/2 av 4 citat hittades på angiven sida/)).toBeInTheDocument();
    // Term buttons open popovers, whose <div>s a paragraph may not contain.
    expect(document.querySelector("p div")).toBeNull();
  });

  it("opens the cited page with the quote marked", async () => {
    mockApi([...baseRoutes(null), noticeRoute, pageRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: /^Sida 4, verifierat citat/ }));
    const mark = await screen.findByText(
      (_, element) => element?.tagName === "MARK" && element.textContent === "Leverantören ska ha en\nansvarsförsäkring",
    );
    expect(mark).toBeInTheDocument();
    expect(screen.getByText("Sida 4 av 16")).toBeInTheDocument();
    expect(screen.getByText("Citatet står på sida 4 i underlaget och är markerat nedan.")).toBeInTheDocument();
  });

  it("does not promise a mark when a verified quote's wording differs from the page", async () => {
    const citation: Citation = { page: 4, quote: "Leverantören ska teckna en försäkring", check: "verified", found_page: null };
    mockApi([...baseRoutes(null), noticeWithCitation(citation), pageRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: /^Sida 4, verifierat citat/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(await within(dialog).findByText(/lite andra ord, så det går inte att markera/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/markerat nedan/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Citatet går inte att markera på den här sidan.")).not.toBeInTheDocument();
    expect(dialog.querySelector("mark")).toBeNull();
  });

  it("opens page 1 when the AI cites a page past the end of the document", async () => {
    const citation: Citation = { page: 40, quote: "Sanktioner vid försening", check: "unverified", found_page: null };
    const calls = mockApi([
      ...baseRoutes(null),
      noticeWithCitation(citation),
      {
        method: "GET",
        path: `/api/notices/${NOTICE_ID}/documents/${DOCUMENT_ID}/pages/1`,
        body: { ...pageFour, page_no: 1, text: "Förfrågningsunderlag" },
      },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: /^Sida 40, kunde inte kontrolleras/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(within(dialog).getByText(/AI:n angav sida 40, men underlaget har bara 16 sidor/)).toBeInTheDocument();
    expect(await within(dialog).findByText("Förfrågningsunderlag")).toBeInTheDocument();
    expect(within(dialog).getByText("Sida 1 av 16")).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith("/pages/40"))).toBe(false);
  });

  it("offers no retry for a page that does not exist, but still lets the reader leaf on", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: /^Sida 4, verifierat citat/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(await within(dialog).findByText("Sidan kunde inte visas")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Nästa sida" })).toBeEnabled();
  });

  it("explains a term when it is pressed", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const [term] = await screen.findAllByRole("button", { name: "försäkringsbevis" });
    await userEvent.click(term!);
    const explanation = await screen.findByRole("dialog", { name: "Förklaring av försäkringsbevis" });
    expect(within(explanation).getByText(/Ett intyg från försäkringsbolaget/)).toBeInTheDocument();
  });
});

describe("NoticePage reminders", () => {
  // As in the demo document: the checklist lists frågestopp three times, and not in date order.
  const dates = [
    dated("sista_anbudsdag", "2026-11-09", "Sista anbudsdag 2026-11-09"),
    dated("fragestopp", "2026-10-30", "Sista dag för frågor 2026-10-30"),
    dated("fragestopp", "2026-11-03", "Sista dag för kommunens svar på frågor 2026-11-03"),
    dated("fragestopp", "2026-10-13", "Anmälan görs via frågefunktionen senast den 13 oktober 2026."),
  ];
  const withDates = noticeWith({
    deadline_at: "2026-11-10T22:59:00Z",
    checklist: { ...checklistView, checklist: { ...checklistView.checklist, dates } },
  });

  it("offers a reminder only on the date row the reminder is for, named by its date", async () => {
    const calls = mockApi([
      ...baseRoutes(companyUser),
      withDates,
      { method: "POST", path: `/api/notices/${NOTICE_ID}/reminders`, body: { ...reminder, due_at: "2026-10-28T08:00:00+01:00" } },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const list = await screen.findByRole("list", { name: "Viktiga datum" });
    const buttons = within(list).getAllByRole("button", { name: /^Påminn mig/ });
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Påminn mig före 9 november 2026",
      "Påminn mig före 30 oktober 2026",
    ]);
    // The rows for 3 November and 13 October get no button: a reminder from them would be for 30 October.
    const rows = within(list).getAllByRole("listitem");
    for (const row of rows.slice(2)) {
      expect(within(row).queryByRole("button", { name: /^Påminn mig/ })).not.toBeInTheDocument();
    }

    await userEvent.click(within(list).getByRole("button", { name: "Påminn mig före 30 oktober 2026" }));
    expect(await within(list).findByText(/Påminnelse skapad till 28 oktober 2026 kl\. 08:00/)).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith("/reminders"))?.body).toEqual({ kind: "fragestopp" });
  });

  it("names the header reminder by the date the backend uses, the checklist's", async () => {
    mockApi([...baseRoutes(companyUser), withDates]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(
      await screen.findByRole("button", { name: "Påminn mig före sista anbudsdag 9 november 2026" }),
    ).toBeInTheDocument();
  });

  it("offers no reminder for a deadline that has passed", async () => {
    vi.setSystemTime(new Date("2026-11-01T10:00:00+01:00"));
    mockApi([...baseRoutes(companyUser), withDates]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const list = await screen.findByRole("list", { name: "Viktiga datum" });
    expect(within(list).getAllByRole("button", { name: /^Påminn mig/ }).map((button) => button.textContent)).toEqual([
      "Påminn mig före 9 november 2026",
    ]);
  });
});

describe("NoticePage questions", () => {
  async function ask(answer: AnswerView, notice: MockRoute = noticeRoute, extra: MockRoute[] = []) {
    const calls = mockApi([
      ...baseRoutes(companyUser),
      notice,
      { method: "POST", path: `/api/notices/${NOTICE_ID}/questions`, body: answer },
      { method: "POST", path: `/api/notices/${NOTICE_ID}/reminders`, body: reminder },
      ...extra,
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);
    await userEvent.type(await screen.findByRole("textbox", { name: /Din fråga/ }), "Får vi arbeta på helger?");
    await userEvent.click(screen.getByRole("button", { name: "Fråga" }));
    expect(await screen.findByText(answer.answer.answer)).toBeInTheDocument();
    return { calls, panel: screen.getByRole("tabpanel", { name: "Fråga underlaget" }) };
  }

  it("answers with citations, advises a formal question and creates a reminder", async () => {
    const { calls, panel } = await ask(answerNotInDocument);

    expect(screen.getByText("Svaret står inte i underlaget")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /^Sida 4, verifierat citat/ })).toBeInTheDocument();
    expect(within(panel).getByText("Ställ frågan formellt i e-Avrop")).toBeInTheDocument();
    expect(within(panel).getByText(/behandla alla leverantörer lika/)).toBeInTheDocument();
    // Frågestopp is a date: no invented time of day.
    expect(within(panel).getByText("16 oktober 2026")).toBeInTheDocument();
    expect(within(panel).queryByText(/kl\. 00:00/)).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: "Påminn mig före frågestoppet 16 oktober 2026" }));
    expect(await within(panel).findByText(/Påminnelse skapad till 14 oktober 2026 kl\. 08:00/)).toBeInTheDocument();

    const question = calls.find((call) => call.path.endsWith("/questions"));
    expect(question?.body).toEqual({ question: "Får vi arbeta på helger?", history: [] });
    expect(calls.find((call) => call.path.endsWith("/reminders"))?.body).toEqual({ kind: "fragestopp" });
  });

  it("offers no frågestopp reminder when the checklist gives no frågestopp", async () => {
    const { panel } = await ask({ ...answerNotInDocument, question_deadline: null });

    expect(within(panel).getByText(/Sista dag för frågor står i underlaget/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /^Påminn mig/ })).not.toBeInTheDocument();
  });

  it("links to the procurement in e-Avrop, whichever of the notice's links goes there", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=fiktiv";
    const { panel } = await ask(
      answerNotInDocument,
      noticeWith({ url: "https://ted.europa.eu/sv/notice/-/detail/1-2026", documents_url: eavrop }),
    );

    expect(within(panel).getByRole("link", { name: /Öppna upphandlingen i e-Avrop/ })).toHaveAttribute("href", eavrop);
  });

  it("does not call e-Avrop itself the procurement when the notice only has a TED page", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall";
    const { panel } = await ask(
      { ...answerNotInDocument, formal_question_url: eavrop },
      noticeWith({ url: "https://ted.europa.eu/sv/notice/-/detail/1-2026", documents_url: null }),
    );

    expect(within(panel).getByRole("link", { name: /Gå till e-Avrop/ })).toHaveAttribute("href", eavrop);
    expect(within(panel).queryByRole("link", { name: /Öppna upphandlingen/ })).not.toBeInTheDocument();
  });

  it("says why a fictitious notice cannot be found in e-Avrop", async () => {
    const { panel } = await ask(
      { ...answerNotInDocument, formal_question_url: "https://www.e-avrop.com/sundsvall" },
      noticeWith({ url: null, documents_url: null }),
    );

    expect(within(panel).getByText(/påhittad för demon och finns därför inte i e-Avrop/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Gå till e-Avrop/ })).toBeInTheDocument();
  });

  const laterDocument = {
    id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
    filename: "Förfrågningsunderlag version 2.pdf",
    page_count: 18,
    is_fictitious: true,
  };
  const twoDocuments = noticeWith({
    documents: [...noticeDetail.documents, laterDocument],
    checklist: { ...checklistView, document_id: laterDocument.id },
  });

  it("opens answer citations in the document the answer names", async () => {
    const { panel } = await ask({ ...answerNotInDocument, document_id: laterDocument.id }, twoDocuments, [
      { ...pageRoute, path: `/api/notices/${NOTICE_ID}/documents/${laterDocument.id}/pages/4`, body: { ...pageFour, page_count: 18 } },
    ]);

    await userEvent.click(within(panel).getByRole("button", { name: /^Sida 4, verifierat citat/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(within(dialog).getByText(laterDocument.filename)).toBeInTheDocument();
    expect(await within(dialog).findByText("Sida 4 av 18")).toBeInTheDocument();
  });

  it("opens answer citations in the first document when the answer does not name one", async () => {
    const { document_id: _unnamed, ...withoutDocument } = answerNotInDocument;
    const { panel } = await ask(withoutDocument as AnswerView, twoDocuments, [pageRoute]);

    await userEvent.click(within(panel).getByRole("button", { name: /^Sida 4, verifierat citat/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(within(dialog).getByText(noticeDetail.documents[0]!.filename)).toBeInTheDocument();
    expect(await within(dialog).findByText("Sida 4 av 16")).toBeInTheDocument();
  });
});

describe("NoticePage submission", () => {
  it("submits through e-Avrop itself when the notice only has a TED page, which takes no tenders", async () => {
    const ted = "https://ted.europa.eu/sv/notice/-/detail/1-2026";
    mockApi([...baseRoutes(companyUser), noticeWith({ url: ted, documents_url: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    const panel = await screen.findByRole("tabpanel", { name: "Inför inlämning" });
    expect(await within(panel).findByRole("link", { name: /Gå till e-Avrop/ })).toHaveAttribute(
      "href",
      config.eavrop_url,
    );
    expect(within(panel).queryByRole("link", { name: /Lämna anbudet i e-Avrop/ })).not.toBeInTheDocument();
  });

  it("names the procurement in e-Avrop when the notice links there", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=fiktiv";
    mockApi([...baseRoutes(companyUser), noticeWith({ url: null, documents_url: eavrop })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    const panel = await screen.findByRole("tabpanel", { name: "Inför inlämning" });
    expect(await within(panel).findByRole("link", { name: /Lämna anbudet i e-Avrop/ })).toHaveAttribute(
      "href",
      eavrop,
    );
  });

  it("points a made-up notice without a page to e-Avrop and says why it is not there", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ url: null, documents_url: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    const panel = await screen.findByRole("tabpanel", { name: "Inför inlämning" });
    expect(await within(panel).findByRole("link", { name: /Gå till e-Avrop/ })).toHaveAttribute(
      "href",
      config.eavrop_url,
    );
    expect(within(panel).getByText(/påhittad för demon och finns därför inte i e-Avrop/)).toBeInTheDocument();
  });
});

describe("NoticePage draft review", () => {
  it("reviews an uploaded draft without storing it and lists gaps first", async () => {
    const calls = mockApi([
      ...baseRoutes(companyUser),
      noticeRoute,
      { method: "POST", path: `/api/notices/${NOTICE_ID}/review`, body: reviewView },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    expect(await screen.findByText("Utkastet sparas inte")).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    await userEvent.upload(input!, new File(["%PDF-1.7 utkast"], "utkast.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Granska utkastet" }));

    const titles = await screen.findAllByRole("heading", { level: 4 });
    expect(titles.map((heading) => heading.textContent)).toEqual([
      "Ansvarsförsäkring om minst 5 miljoner kronor",
      "Två referensuppdrag",
    ]);
    expect(screen.getByText("Obevisat", { selector: "*" })).toBeInTheDocument();
    expect(screen.getByText(/Utkastet har inte sparats/)).toBeInTheDocument();
    const upload = calls.find((call) => call.path.endsWith("/review"));
    expect((upload?.body as FormData).get("file")).toBeInstanceOf(File);
  });
});
