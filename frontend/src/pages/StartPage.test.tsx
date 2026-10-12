import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyView, MatchView, UpcomingProcurement } from "../api/types";
import { PHONE_QUERY } from "../lib/usePhone";
import { companyUser, matchView, noticeSummary, reminder } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../test/render";

const profile: CompanyView = {
  id: companyUser.company!.id,
  org_number: null,
  name: "Målerifirman i Matfors AB",
  description: "Invändig och utvändig målning.",
  cpv_codes: ["45442100", "45442110"],
  cpv_labels: { "45442100": "Målning", "45442110": "Målning av byggnader" },
  cpv_divisions: {},
  municipalities: ["Sundsvall", "Timrå"],
  employees: 4,
  annual_turnover_sek: 3_000_000,
  certifications: [],
  insurance: "Ansvarsförsäkring 5 000 000 kr",
  public_references: null,
  is_fictitious: true,
};

const painting: UpcomingProcurement = {
  agreement_id: "3c2b1a0f-9e8d-4c7b-a6f5-e4d3c2b1a0f9",
  title: "Ramavtal måleriarbeten",
  category: "Bygg och fastighet",
  cpv_codes: ["45442100"],
  end_date: "2027-11-30",
  max_end_date: null,
  expected_from: "2027-02-28",
  expected_to: "2027-05-30",
  previous_requirements: "Ansvarsförsäkring minst 5 miljoner kronor och två referensuppdrag.",
  is_fictitious: true,
  relevant_for_company: true,
  announcement_overdue: false,
};

const interpreting: UpcomingProcurement = {
  ...painting,
  agreement_id: "4d3c2b1a-0f9e-4d8c-b7a6-f5e4d3c2b1a0",
  title: "Tolktjänster",
  cpv_codes: ["79540000"],
  end_date: "2026-12-31",
  expected_from: "2026-03-31",
  expected_to: "2026-06-30",
  previous_requirements: null,
  relevant_for_company: false,
  announcement_overdue: true,
};

function startRoutes({ matches = [matchView] }: { matches?: MatchView[] } = {}): MockRoute[] {
  return [
    ...baseRoutes(companyUser),
    { method: "GET", path: "/api/matches", body: matches },
    { method: "GET", path: "/api/reminders", body: [reminder] },
    { method: "GET", path: "/api/upcoming", body: [interpreting, painting] },
    { method: "GET", path: "/api/profile", body: profile },
  ];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Makes the viewport phone-sized for the design system's media queries. */
function asPhone() {
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
}

describe("StartPage", () => {
  it("greets by first name and answers first: how many matches and when the next deadline is", async () => {
    mockApi(startRoutes());
    renderApp("/start");

    expect(await screen.findByRole("heading", { level: 1, name: "Välkommen, Anna" })).toBeInTheDocument();
    expect(await screen.findByText("Målerifirman i Matfors AB · 1 ny träff · nästa frist om 11 dagar")).toBeInTheDocument();
  });

  it("shows the next deadline with its reminder, and the same notice's deadline after it", async () => {
    mockApi(startRoutes());
    renderApp("/start");

    const card = await screen.findByRole("region", { name: "Nästa frist" });
    expect(within(card).getByRole("heading", { level: 2, name: "Nästa frist" })).toBeInTheDocument();
    expect(within(card).getByText("16 okt")).toBeInTheDocument();
    expect(within(card).getByText("Sista dag för frågor")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: noticeSummary.title })).toHaveAttribute(
      "href",
      `/upphandlingar/${noticeSummary.id}`,
    );
    // The company already has a reminder for frågestoppet; none yet for sista anbudsdag.
    expect(await within(card).findByText("Påminnelse mejlas 14 okt")).toBeInTheDocument();
    expect(within(card).getByText("Därefter: Sista anbudsdag 26 okt kl. 23:59 · om 21 dagar")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Påminn mig före sista anbudsdag 26 oktober 2026" }),
    ).toBeInTheDocument();
  });

  it("shows each match as a card with its fit, at most three reasons with their sources, and the way in", async () => {
    mockApi(startRoutes());
    renderApp("/start");

    const card = await screen.findByRole("article", { name: noticeSummary.title });
    expect(within(card).getByText("Passar delvis")).toBeInTheDocument();
    expect(within(card).getByText("Fiktiv")).toBeInTheDocument();
    expect(within(card).getByText("Granskad checklista")).toBeInTheDocument();
    const reasons = within(card).getByRole("list", { name: "Därför passar den delvis" });
    expect(within(reasons).getAllByRole("listitem")).toHaveLength(3);
    expect(within(reasons).getByText("Kontrollera själv:")).toBeInTheDocument();
    expect(
      within(reasons).getByRole("link", {
        name: "Visa källan för ”Ni har angett en försäkring i profilen. Kontrollera att den räcker för kravet.”, s. 4",
      }),
    ).toBeInTheDocument();
    // A quote found on another page than the AI gave says so.
    expect(
      within(reasons).getByRole("link", {
        name: "Visa källan för ”Underlaget ställer krav på referensuppdrag, men er profil säger inget om det.”, s. 6 (AI angav 5)",
      }),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Visa alla skäl/ })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: `Öppna checklistan: ${noticeSummary.title}` })).toHaveAttribute(
      "href",
      `/upphandlingar/${noticeSummary.id}`,
    );
    expect(within(card).getByText("Automatiskt framtaget")).toBeInTheDocument();
  });

  it("folds reasons beyond three behind Visa alla skäl, and says when no checklist backs the assessment", async () => {
    const extra = { kind: "styrka" as const, text: "Ni och annonsen använder samma ord: fasad.", requirement_id: null, citation: null };
    const withoutChecklist: MatchView = {
      ...matchView,
      notice: { ...noticeSummary, checklist_status: "none" },
      assessment: { ...matchView.assessment, reasons: [...matchView.assessment.reasons, extra] },
    };
    mockApi(startRoutes({ matches: [withoutChecklist] }));
    renderApp("/start");

    const card = await screen.findByRole("article", { name: noticeSummary.title });
    const reasons = within(card).getByRole("list", { name: "Därför passar den delvis" });
    expect(within(reasons).queryByText(extra.text)).not.toBeInTheDocument();
    expect(within(reasons).getByText(/Bedömt bara på CPV-kod och ord i annonsen/)).toBeInTheDocument();
    // The category is left out of the card: the first reason says what the procurement is about.
    expect(within(card).getByText("Sundsvalls kommun · Ingen checklista ännu")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: `Öppna upphandlingen: ${noticeSummary.title}` })).toBeInTheDocument();

    const more = within(card).getByRole("button", { name: "Visa alla skäl (4)" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(within(reasons).getByText(extra.text)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Visa färre skäl" })).toHaveAttribute("aria-expanded", "true");
  });

  it("hides a match on Inte intressant and brings it back with Ångra", async () => {
    let isDismissed = false;
    // The first route that fits answers, so these come before the defaults: the server remembers the dismissal.
    const serverState: MockRoute[] = [
      { method: "GET", path: "/api/matches", body: () => (isDismissed ? [] : [matchView]) },
      {
        method: "POST",
        path: `/api/matches/${matchView.id}/dismiss`,
        status: 204,
        body: () => {
          isDismissed = true;
        },
      },
      {
        method: "POST",
        path: `/api/matches/${matchView.id}/restore`,
        status: 204,
        body: () => {
          isDismissed = false;
        },
      },
    ];
    const calls = mockApi([...serverState, ...startRoutes()]);
    renderApp("/start");

    const card = await screen.findByRole("article", { name: noticeSummary.title });
    await userEvent.click(within(card).getByRole("button", { name: `Inte intressant: ${noticeSummary.title}` }));

    // The toast's words are also written to the live region for screen readers.
    expect((await screen.findAllByText(`Dold: ${noticeSummary.title}`)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("article", { name: noticeSummary.title })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { level: 2, name: /Nya träffar/ })).toHaveFocus();
    expect(await screen.findByText("Inga nya träffar just nu")).toBeInTheDocument();

    // The toast layer is a popover, which jsdom does not show: the query includes hidden elements.
    await userEvent.click(screen.getByRole("button", { name: `Ångra: ${noticeSummary.title}`, hidden: true }));
    const back = await screen.findByRole("article", { name: noticeSummary.title });
    await waitFor(() => expect(within(back).getByRole("link", { name: noticeSummary.title })).toHaveFocus());
    expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
      `/api/matches/${matchView.id}/dismiss`,
      `/api/matches/${matchView.id}/restore`,
    ]);
  });

  it("keeps a match the engine thinks does not fit out of the cards, one click away", async () => {
    const unfit: MatchView = { ...matchView, id: "unfit", fit: "passar_inte", notice: { ...noticeSummary, fit: "passar_inte" } };
    mockApi(startRoutes({ matches: [unfit] }));
    renderApp("/start");

    expect(await screen.findByText("Inga nya träffar just nu")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Nästa frist" })).not.toBeInTheDocument();
    expect(screen.getByText("Målerifirman i Matfors AB · inga nya träffar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Verkar inte passa (1)" }));
    const list = screen.getByRole("list", { name: "Verkar inte passa" });
    expect(within(list).getByRole("link", { name: noticeSummary.title })).toBeInTheDocument();
    expect(within(list).getByText("Verkar inte passa")).toBeInTheDocument();
  });

  it("shows what is coming for the company as a timeline, and everything on Alla", async () => {
    mockApi(startRoutes());
    renderApp("/start");

    const section = await screen.findByRole("region", { name: "Kommande upphandlingar" });
    const timeline = await within(section).findByRole("list", { name: "Kommande upphandlingar" });
    expect(within(section).getByRole("radio", { name: "För er" })).toBeChecked();
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(1);
    expect(within(timeline).getByRole("heading", { level: 3, name: "Ramavtal måleriarbeten" })).toBeInTheDocument();
    expect(within(timeline).getByText("feb–maj 2027")).toBeInTheDocument();
    expect(within(timeline).getByText("Nuvarande avtal löper ut 30 november 2027.")).toBeInTheDocument();

    await userEvent.click(within(timeline).getByRole("button", { name: "Förbered er: det här krävdes förra gången" }));
    expect(within(timeline).getByText(painting.previous_requirements!)).toBeVisible();

    await userEvent.click(within(section).getByRole("radio", { name: "Alla" }));
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
    expect(within(timeline).getByText("borde redan ha annonserats")).toBeInTheDocument();
    expect(within(timeline).getByRole("link", { name: "Sök bland de öppna upphandlingarna" })).toHaveAttribute(
      "href",
      `/upphandlingar?q=${encodeURIComponent("Tolktjänster")}`,
    );
  });

  it("lists the reminders still to be mailed, with the deadline and the sending as two facts", async () => {
    const calls = mockApi([
      ...startRoutes(),
      { method: "DELETE", path: `/api/reminders/${reminder.id}`, status: 204 },
    ]);
    renderApp("/start");

    const card = await screen.findByRole("region", { name: "Dina påminnelser" });
    expect(await within(card).findByRole("link", { name: noticeSummary.title })).toBeInTheDocument();
    expect(within(card).getByText("Sista dag för frågor 16 okt")).toBeInTheDocument();
    expect(within(card).getByText("Mejlas 14 okt kl. 08:00 · skickas om 9 dagar")).toBeInTheDocument();
    expect(within(card).getByText(`Mejlas till ${companyUser.email}`)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Alla påminnelser" })).toHaveAttribute("href", "/paminnelser");

    await userEvent.click(within(card).getByRole("button", { name: `Ta bort påminnelsen om ${noticeSummary.title}` }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ta bort påminnelsen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort" }));
    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
  });

  it("shows what the matches build on from the profile, by name", async () => {
    mockApi(startRoutes());
    renderApp("/start");

    const card = await screen.findByRole("region", { name: "Träffarna bygger på er profil" });
    expect(await within(card).findByText("Målning")).toBeInTheDocument();
    expect(within(card).getByText("Målning av byggnader")).toBeInTheDocument();
    expect(within(card).getByText("Sundsvall, Timrå")).toBeInTheDocument();
    expect(within(card).getByText("Ansvarsförsäkring 5 000 000 kr")).toBeInTheDocument();
    expect(within(card).getByText("Inte angivet")).toBeInTheDocument();
    expect(within(card).queryByText("45442100")).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Ändra profil" })).toHaveAttribute("href", "/profil");
  });

  it("offers Regelhjälpen with an example question that it answers on arrival", async () => {
    mockApi(startRoutes());
    renderApp("/start");

    const card = await screen.findByRole("region", { name: "Frågor om upphandling?" });
    expect(within(card).getByRole("link", { name: "Hur lång är avtalsspärren?" })).toHaveAttribute(
      "href",
      "/regelhjalpen?fraga=Hur%20l%C3%A5ng%20%C3%A4r%20avtalssp%C3%A4rren%3F",
    );
    expect(within(card).getByRole("link", { name: "Öppna Regelhjälpen" })).toHaveAttribute("href", "/regelhjalpen");
  });

  it("keeps the phone's first screen to the deadline and the first card", async () => {
    asPhone();
    mockApi(startRoutes());
    renderApp("/start");

    const next = await screen.findByRole("region", { name: "Nästa frist" });
    // What the deadline is and the procurement on two lines, without a dot left at the end of the first.
    expect(within(next).getByText("Sista dag för frågor")).toBeInTheDocument();
    expect(within(next).queryByText("·")).not.toBeInTheDocument();
    // The company already has this reminder: the card says so instead of offering it.
    const change = await within(next).findByRole("link", { name: "Ändra påminnelsen om sista dag för frågor" });
    expect(change).toHaveAttribute("href", "/paminnelser");
    expect(within(next).queryByText(/^Därefter/)).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Alla upphandlingar" })).toHaveAttribute("href", "/upphandlingar");
    expect(screen.queryByText(/^Bedömda mot er profil/)).not.toBeInTheDocument();
    const card = await screen.findByRole("article", { name: noticeSummary.title });
    // The deadline on one line: the words for the eye, while screen readers hear the block's own label once.
    const labels = within(card).getAllByText("Sista anbudsdag");
    expect(labels.filter((label) => label.getAttribute("aria-hidden") === "true")).toHaveLength(1);
    expect(within(card).getByText("26 okt kl. 23:59")).toBeInTheDocument();
    expect(within(card).getByText("om 21 dagar")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Påminnelser, profil och hjälp" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dina påminnelser" })).toBeInTheDocument();
  });

  it("is for companies: a visitor is asked to log in", async () => {
    mockApi(baseRoutes(null));
    renderApp("/start");
    expect(await screen.findByRole("heading", { name: "Logga in för att se sidan" })).toBeInTheDocument();
  });
});
