import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Citation, KeyDate, MatchReason, NoticeDetail } from "../../api/types";
import {
  buyerUser,
  checklistView,
  companyUser,
  DOCUMENT_ID,
  draftChecklistView,
  matchView,
  NOTICE_ID,
  noticeDetail,
  pageFour,
  reminder,
} from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../test/render";
import { PHONE_QUERY } from "../../lib/usePhone";

const noticeRoute: MockRoute = { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail };
const pageRoute = (page: number, text = pageFour.text): MockRoute => ({
  method: "GET",
  path: `/api/notices/${NOTICE_ID}/documents/${DOCUMENT_ID}/pages/${page}`,
  body: { ...pageFour, page_no: page, text },
});

function noticeWith(changes: Partial<NoticeDetail>): MockRoute {
  return { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, ...changes } };
}

function noticeWithCitation(citation: Citation): MockRoute {
  const [first, ...rest] = checklistView.checklist.requirements;
  const checklist = { ...checklistView.checklist, requirements: [{ ...first!, citation }, ...rest] };
  return noticeWith({ checklist: { ...checklistView, checklist } });
}

function dated(kind: KeyDate["kind"], date: string, description: string): KeyDate {
  return { kind, date, description, citation: { page: 2, quote: description, check: "verified", found_page: null, document: null, document_id: null } };
}

function sectionButton(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

// Reminders are offered only for deadlines that have not passed; the tests run on a fixed day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NoticePage header", () => {
  it("leads with the four key facts and only the tokens that say something", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: noticeDetail.title })).toBeInTheDocument();
    // Who buys and the reference number people quote.
    const meta = screen.getByText("Sundsvalls kommun · DEMO-2026-0147");
    // Fiktiv first, then the fit and the reviewed checklist (direction.md, section 4).
    const tokens = meta.parentElement!.textContent!;
    expect(tokens.indexOf("Fiktiv")).toBeLessThan(tokens.indexOf("Passar delvis"));
    expect(tokens.indexOf("Passar delvis")).toBeLessThan(tokens.indexOf("Granskad checklista"));
    // Open for tenders is the normal state and gets no token.
    expect(screen.queryByText("Öppen för anbud")).not.toBeInTheDocument();

    const facts = screen.getByRole("region", { name: "Nyckeltal" });
    expect(within(facts).getByText("26 okt 2026")).toBeInTheDocument();
    expect(within(facts).getByText("om 21 dagar")).toBeInTheDocument();
    expect(within(facts).getByText("16 okt 2026")).toBeInTheDocument();
    expect(within(facts).getByText(/^800\s000\skr$/u)).toBeInTheDocument();
    // The procedure in plain words, its term explained on a press, and the law below.
    expect(within(facts).getByRole("button", { name: "EU:s beloppsgränser" })).toBeInTheDocument();
    expect(within(facts).getByText("19 kap. LOU")).toBeInTheDocument();
    // A visitor is taken to the login to set a reminder.
    expect(within(facts).getByRole("link", { name: "Påminn mig före sista anbudsdag 26 oktober 2026, logga in först" })).toBeInTheDocument();
  });

  it("opens the document from the header on page 1, with the original to download", async () => {
    mockApi([...baseRoutes(null), noticeRoute, pageRoute(1, "Förfrågningsunderlag")]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("link", { name: "Ladda ned underlaget" })).toHaveAttribute(
      "href",
      `/api/documents/${DOCUMENT_ID}/file`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Underlaget, 16 sidor" }));
    const dialog = await screen.findByRole("dialog", { name: "Underlaget" });
    expect(await within(dialog).findByText("Sida 1 av 16")).toBeInTheDocument();
  });

  it("keeps the fit behind a disclosure, with at most three reasons and their sources", async () => {
    const extra: MatchReason = { kind: "hinder", text: "Underlaget kräver en arbetsledare med fem års erfarenhet.", requirement_id: null, citation: null };
    const match = { ...matchView, assessment: { ...matchView.assessment, reasons: [...matchView.assessment.reasons, extra] } };
    mockApi([...baseRoutes(companyUser), noticeWith({ match })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const toggle = await screen.findByRole("button", { name: "Därför passar den delvis (4 skäl)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(within(panel).getByText("Upphandlingen gäller målning – det gör ni.")).toBeInTheDocument();
    expect(within(panel).getByText("Kontrollera själv:")).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", {
        name: "Visa källan för ”Ni har angett en försäkring i profilen. Kontrollera att den räcker för kravet.”, s. 4",
      }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(extra.text)).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Visa alla skäl (4)" }));
    expect(within(panel).getByText(extra.text)).toBeInTheDocument();
    expect(within(panel).getByText(/^Automatiskt framtaget/u)).toBeInTheDocument();
  });

  it("leads from a fit reason about a requirement to its row in step 1", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ match: matchView })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=fraga`);

    await userEvent.click(await screen.findByRole("button", { name: "Därför passar den delvis (3 skäl)" }));
    // Only the reasons about a requirement link to one.
    expect(screen.getAllByRole("link", { name: /^Visa kravet/u })).toHaveLength(2);
    await userEvent.click(screen.getByRole("link", { name: "Visa kravet ”Ansvarsförsäkring om minst 5 miljoner kronor”" }));
    expect(screen.getByRole("tab", { name: "Krav" })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("krav-K1")).toBeVisible();
  });

  it("keeps what else the notice says behind Om upphandlingen", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const toggle = await screen.findByRole("button", { name: "Om upphandlingen" });
    await userEvent.click(toggle);
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(within(panel).getByText(noticeDetail.description!)).toBeInTheDocument();
    expect(within(panel).getByText("Vad som upphandlas")).toBeInTheDocument();
    expect(within(panel).getByText("Målning")).toBeInTheDocument();
    expect(within(panel).getByText("21 sep 2026")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Öppna annonsen/u })).toHaveAttribute("href", noticeDetail.url);
  });

  it("puts the disclosures and the document in one card on a phone, and the steps without numbers", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === PHONE_QUERY,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const facts = await screen.findByRole("region", { name: "Nyckeltal" });
    expect(within(facts).getByText("Frågor senast")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Underlaget, 16 sidor" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Om upphandlingen och underlaget" }));
    expect(await screen.findByRole("button", { name: `Öppna underlaget ${noticeDetail.documents[0]!.filename}` })).toBeInTheDocument();
    // Four short labels, no step numbers.
    expect(within(screen.getByRole("tab", { name: "Krav" })).queryByText("1")).not.toBeInTheDocument();
    // The tiles give the figure and the word only, and the provenance line says who reviewed in fewer words.
    expect(screen.getByRole("link", { name: "1 skallkrav" })).toBeInTheDocument();
    expect(screen.getByText("Granskad av inköp 23 sep")).toBeInTheDocument();
  });

  it("explains an award decision", async () => {
    mockApi([...baseRoutes(null), noticeWith({ status: "awarded" })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByText("Tilldelad")).toBeInTheDocument();
    expect(screen.getByText("Tilldelningsbeslut är fattat")).toBeInTheDocument();
  });

  it("says when a notice does not exist, without an error to retry", async () => {
    mockApi(baseRoutes(null));
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Upphandlingen finns inte" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Ingen upphandling på den här adressen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Till alla upphandlingar" })).toHaveAttribute("href", "/upphandlingar");
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
  });

  it("offers to try again when a notice could not be fetched", async () => {
    mockApi([...baseRoutes(null), { method: "GET", path: `/api/notices/${NOTICE_ID}`, status: 503, body: { detail: "Tjänsten svarar inte just nu." } }]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Upphandlingen kunde inte visas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Till alla upphandlingar" })).toHaveAttribute("href", "/upphandlingar");
  });
});

describe("NoticePage step 1 Krav", () => {
  it("groups the requirements with their counts, skallkrav and kvalificeringskrav open, each with its page", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("tab", { name: "Krav" })).toHaveAttribute("aria-selected", "true");
    expect(sectionButton("Skallkrav, 1 krav")).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton("Kvalificeringskrav, 1 krav")).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton("Bilagor att lämna in, 1 bilaga")).toHaveAttribute("aria-expanded", "false");
    expect(sectionButton("Så utvärderas anbuden")).toHaveAttribute("aria-expanded", "false");
    expect(sectionButton("Viktiga datum")).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton("Ord och begrepp, 1 ord")).toHaveAttribute("aria-expanded", "false");

    expect(screen.getByRole("link", { name: "Visa källan för ”Ansvarsförsäkring om minst 5 miljoner kronor”, s. 4" })).toBeInTheDocument();
    // The quote was found on page 6, not the page 5 the AI gave: the link opens page 6 and says so.
    expect(screen.getByRole("link", { name: /s\. 6 \(AI angav 5\)$/u })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visa källan för ”Sista dag för frågor, 16 oktober 2026”, s. 2" })).toBeInTheDocument();

    await userEvent.click(sectionButton("Bilagor att lämna in, 1 bilaga"));
    expect(screen.getByRole("link", { name: "Visa källan för ”Prisbilaga”, Hittades inte i underlaget" })).toBeInTheDocument();
    // Term buttons open popovers, whose <div>s a paragraph may not contain.
    expect(document.querySelector("p div")).toBeNull();
  });

  it("says once who reviewed the list and how its sources held up", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByText("Granskad och publicerad av inköp, Sundsvalls kommun, 23 sep 2026")).toBeInTheDocument();
    expect(
      screen.getByText(
        "3 av 4 källhänvisningar hittades i underlaget · 1 på en annan sida än AI:n angav · 1 hittades inte och behöver kontrolleras ·",
      ),
    ).toBeInTheDocument();
  });

  it("leads with tiles for what to do, and a tile opens its closed section", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("link", { name: "1 skallkrav, måste uppfyllas" })).toHaveAttribute("href", "/upphandlingar/" + NOTICE_ID + "#skallkrav");
    expect(screen.getByRole("link", { name: "1 kvalificeringskrav, krav på företaget" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "70 % pris, så vinner man" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "1 bilaga, att lämna med anbudet" }));
    expect(sectionButton("Bilagor att lämna in, 1 bilaga")).toHaveAttribute("aria-expanded", "true");
  });

  it("opens a closed section that the outline goes to", async () => {
    // The outline scrolls with scrollIntoView, which jsdom does not have.
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      mockApi([...baseRoutes(null), noticeRoute]);
      renderApp(`/upphandlingar/${NOTICE_ID}`);

      const outline = await screen.findByRole("navigation", { name: "På den här sidan" });
      expect(sectionButton("Ord och begrepp, 1 ord")).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(within(outline).getByRole("link", { name: "Ord och begrepp" }));
      expect(sectionButton("Ord och begrepp, 1 ord")).toHaveAttribute("aria-expanded", "true");
    } finally {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("explains a term when it is pressed", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const [term] = await screen.findAllByRole("button", { name: "försäkringsbevis" });
    await userEvent.click(term!);
    const explanation = await screen.findByRole("dialog", { name: "Förklaring av försäkringsbevis" });
    expect(within(explanation).getByText(/Ett intyg från försäkringsbolaget/u)).toBeInTheDocument();
  });

  it("ends with the next step, which opens the Fråga AI panel about the notice", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: "Ställ en fråga" }));
    const panel = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(await within(panel).findByRole("radio", { name: "Underlaget" })).toBeChecked();
    expect(screen.queryByRole("tab", { name: "Fråga" })).not.toBeInTheDocument();
  });

  it("shows inköp an unpublished checklist as not yet what companies see", async () => {
    mockApi([...baseRoutes(buyerUser), noticeWith({ checklist: draftChecklistView, question_deadline: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByText("Inte publicerad: utkast")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Granska checklistan" })).toHaveAttribute("href", `/inkop/checklistor/${draftChecklistView.id}`);
    expect(screen.getByText(/^Automatiskt framtaget/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Påminn mig/u })).not.toBeInTheDocument();
  });
});

describe("NoticePage key dates", () => {
  // As in the demo document: frågestopp three times, not in date order, and a period as two rows.
  const dates = [
    dated("sista_anbudsdag", "2026-11-09", "Sista anbudsdag 2026-11-09 kl. 23.59"),
    dated("fragestopp", "2026-10-30", "Sista dag för frågor 2026-10-30"),
    dated("annat", "2026-11-03", "Sista dag för kommunens svar på frågor 2026-11-03"),
    dated("fragestopp", "2026-10-13", "Anmälan via frågefunktionen senast 2026-10-13"),
    dated("annat", "2027-05-17", "Utvändig målning 2027-05-17 – 2027-06-25"),
    dated("annat", "2027-06-25", "Utvändig målning 2027-05-17 – 2027-06-25"),
  ];
  const withDates = noticeWith({
    deadline_at: "2026-11-10T22:59:00Z",
    question_deadline: "2026-10-30T23:59:59+01:00",
    checklist: { ...checklistView, checklist: { ...checklistView.checklist, dates } },
  });

  it("lists the dates before the tender in date order, without the ISO dates, and the rest closed", async () => {
    mockApi([...baseRoutes(null), withDates]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const before = await screen.findByRole("list", { name: "Före anbudet" });
    expect(within(before).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      // Each date is shown short ("13 okt") and read out in full.
      expect.stringMatching(/^13 okt13 oktober 2026Sista dag för frågor/u),
      expect.stringMatching(/^30 okt30 oktober 2026Sista dag för frågor/u),
      expect.stringMatching(/^3 nov3 november 2026Sista dag för kommunens svar på frågor/u),
      expect.stringMatching(/^9 nov9 november 2026Sista anbudsdag kl\. 23:59/u),
    ]);
    const after = screen.getByRole("button", { name: "Efter anbudet och under uppdraget (1)" });
    await userEvent.click(after);
    const later = screen.getByRole("list", { name: "Efter anbudet och under uppdraget" });
    expect(within(later).getByText("17 maj – 25 jun 2027")).toBeInTheDocument();
    expect(within(later).getByText("Utvändig målning")).toBeInTheDocument();
  });

  it("offers a reminder only on the rows the backend reminds about, and confirms it", async () => {
    let created = false;
    // The backend reminds two days before the checklist's frågestopp, which it sends as the end of that day.
    const made = { ...reminder, due_at: "2026-10-28T08:00:00+01:00", deadline_at: "2026-10-30T23:59:59+01:00" };
    const calls = mockApi([
      ...baseRoutes(companyUser),
      withDates,
      { method: "GET", path: "/api/reminders", body: () => (created ? [made] : []) },
      {
        method: "POST",
        path: `/api/notices/${NOTICE_ID}/reminders`,
        body: () => {
          created = true;
          return made;
        },
      },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const before = await screen.findByRole("list", { name: "Före anbudet" });
    const buttons = await within(before).findAllByRole("button", { name: /^Påminn mig/u });
    expect(buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
      "Påminn mig före sista dag för frågor 30 oktober 2026",
      "Påminn mig före sista anbudsdag 9 november 2026",
    ]);

    await userEvent.click(buttons[0]!);
    expect(await within(before).findByText("Påminnelse mejlas 28 okt")).toBeInTheDocument();
    const row = within(before).getByText("Påminnelse mejlas 28 okt").closest("li")!;
    expect(within(row).getByRole("status")).toHaveTextContent(
      "Klart! Du får ett mejl 28 oktober kl. 08:00, två dagar före sista dag för frågor.",
    );
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ kind: "fragestopp" });
  });

  it("names the header's reminder by the date the backend uses, the checklist's", async () => {
    mockApi([...baseRoutes(companyUser), withDates]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const facts = await screen.findByRole("region", { name: "Nyckeltal" });
    expect(await within(facts).findByRole("button", { name: "Påminn mig före sista anbudsdag 9 november 2026" })).toBeInTheDocument();
  });

  it("names a restricted procedure's deadline as the last day for anbudsansökan, and reminds about that", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ deadline_kind: "request" })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const facts = await screen.findByRole("region", { name: "Nyckeltal" });
    expect(within(facts).getByText("Sista dag för anbudsansökan")).toBeInTheDocument();
    expect(within(facts).queryByText("Sista anbudsdag")).not.toBeInTheDocument();
    expect(
      await within(facts).findByRole("button", { name: "Påminn mig före sista dag för anbudsansökan 26 oktober 2026" }),
    ).toBeInTheDocument();
  });

  it("marks passed dates and offers no reminder for them", async () => {
    vi.setSystemTime(new Date("2026-11-01T10:00:00+01:00"));
    mockApi([...baseRoutes(companyUser), withDates]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const before = await screen.findByRole("list", { name: "Före anbudet" });
    const buttons = await within(before).findAllByRole("button", { name: /^Påminn mig/u });
    expect(buttons).toHaveLength(1);
    expect(within(before).getAllByText("passerat")).toHaveLength(2);
  });
});

describe("NoticePage source dialog", () => {
  it("opens the cited page with the quote marked and says where the claim was shown", async () => {
    mockApi([...baseRoutes(null), noticeRoute, pageRoute(4)]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("link", { name: /Ansvarsförsäkring om minst 5 miljoner kronor”, s\. 4$/u }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    // The page's lines are joined into paragraphs, so the quote that ran over a line break reads as one line.
    const mark = await within(dialog).findByText(
      (_, element) => element?.tagName === "MARK" && element.textContent === "Leverantören ska ha en ansvarsförsäkring",
    );
    expect(mark).toBeInTheDocument();
    expect(within(dialog).getByText("Citatet står på sida 4 och är markerat nedan.")).toBeInTheDocument();
    expect(within(dialog).getByText(`Från: Skallkrav · ${noticeDetail.title}`)).toBeInTheDocument();
  });

  it("does not promise a mark when a verified quote's wording differs from the page", async () => {
    const citation: Citation = { page: 4, quote: "Leverantören ska teckna en försäkring", check: "verified", found_page: null, document: null, document_id: null };
    mockApi([...baseRoutes(null), noticeWithCitation(citation), pageRoute(4)]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("link", { name: /Ansvarsförsäkring om minst 5 miljoner kronor”, s\. 4$/u }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(await within(dialog).findByText(/lite andra ord, så det går inte att markera/u)).toBeInTheDocument();
    expect(dialog.querySelector("mark")).toBeNull();
  });

  it("opens page 1 when the AI cites a page past the end of the document", async () => {
    const citation: Citation = { page: 40, quote: "Sanktioner vid försening", check: "unverified", found_page: null, document: null, document_id: null };
    const calls = mockApi([...baseRoutes(null), noticeWithCitation(citation), pageRoute(1, "Förfrågningsunderlag")]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("link", { name: /Ansvarsförsäkring om minst 5 miljoner kronor”, Hittades inte i underlaget$/u }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(within(dialog).getByText(/AI:n angav sida 40, men underlaget har bara 16 sidor/u)).toBeInTheDocument();
    expect(await within(dialog).findByText("Sida 1 av 16")).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith("/pages/40"))).toBe(false);
  });

  it("opens the source an address names, as a link from a mail or another page does", async () => {
    mockApi([...baseRoutes(null), noticeRoute, pageRoute(4)]);
    const params = new URLSearchParams({ citat: "Leverantören ska ha en ansvarsförsäkring", sida: "4", pastaende: "Försäkringen" });
    renderApp(`/upphandlingar/${NOTICE_ID}?${params.toString()}`);

    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(within(dialog).getByText("Försäkringen")).toBeInTheDocument();
    expect(await within(dialog).findByText("Citatet står på sida 4 och är markerat nedan.")).toBeInTheDocument();
  });

  it("opens the document for the old address of the document tab", async () => {
    mockApi([...baseRoutes(null), noticeRoute, pageRoute(1, "Förfrågningsunderlag")]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=underlag`);

    const dialog = await screen.findByRole("dialog", { name: "Underlaget" });
    expect(await within(dialog).findByText("Sida 1 av 16")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Krav" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("NoticePage without a checklist", () => {
  const withoutChecklist = noticeWith({ checklist: null, checklist_status: "none", question_deadline: null, match: matchView });

  it("explains why there are no steps and offers the notice and questions, with the one reminder at the deadline", async () => {
    mockApi([...baseRoutes(companyUser), withoutChecklist]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("heading", { level: 2, name: "Ingen granskad checklista ännu" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Öppna annonsen (öppnas i en ny flik)" })).toHaveAttribute("href", noticeDetail.url);
    // One reminder per deadline: beside sista anbudsdag in the key facts.
    const reminders = await screen.findAllByRole("button", { name: "Påminn mig före sista anbudsdag 26 oktober 2026" });
    expect(reminders).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Nyckeltal" })).getByRole("button", { name: /^Påminn mig/u })).toBe(reminders[0]);

    // "Fråga underlaget" opens the "Fråga AI" panel about this notice (decision 0014).
    await userEvent.click(screen.getByRole("button", { name: "Fråga underlaget" }));
    const panel = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(await within(panel).findByRole("radio", { name: "Underlaget" })).toBeChecked();
    expect(within(panel).getByRole("textbox")).toBeInTheDocument();
  });

  it("leads to the notice and to the documents where they are kept when none are read in here", async () => {
    const ted = "https://ted.europa.eu/sv/notice/-/detail/123456-2026";
    const eavrop = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=123456";
    mockApi([
      ...baseRoutes(companyUser),
      noticeWith({ checklist: null, checklist_status: "none", has_documents: false, documents: [], url: ted, documents_url: eavrop, source: "ted" }),
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByText(/^Underlaget finns i e-Avrop men har inte lästs in här/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Öppna annonsen i TED (öppnas i en ny flik)" })).toHaveAttribute("href", ted);
    expect(screen.getByRole("link", { name: "Underlaget i e-Avrop (öppnas i en ny flik)" })).toHaveAttribute("href", eavrop);
    expect(screen.queryByRole("button", { name: "Fråga underlaget" })).not.toBeInTheDocument();
  });

  it("says that the fit rests on the notice alone", async () => {
    mockApi([...baseRoutes(companyUser), withoutChecklist]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: "Därför passar den delvis (3 skäl)" }));
    expect(screen.getByText(/Bedömt bara på CPV-kod och ord i annonsen/u)).toBeInTheDocument();
  });

  it("promises no checklist for an awarded notice", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ checklist: null, checklist_status: "none", status: "awarded", has_documents: false, documents: [] })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("heading", { level: 2, name: "Ingen granskad checklista" })).toBeInTheDocument();
    expect(screen.getByText(/^Tilldelningsbeslutet är fattat, och det finns ingen granskad checklista/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Påminn mig/u })).not.toBeInTheDocument();
  });

  it("offers no questions when there is no document", async () => {
    mockApi([...baseRoutes(null), noticeWith({ checklist: null, has_documents: false, documents: [], question_deadline: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByText(/Underlaget finns hos upphandlingen men har inte lästs in här/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fråga underlaget" })).not.toBeInTheDocument();
  });
});
