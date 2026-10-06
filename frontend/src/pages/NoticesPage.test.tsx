import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyView, NoticeList, UpcomingProcurement, UserView } from "../api/types";
import { PHONE_QUERY } from "../lib/usePhone";
import { companyUser, matchView, noticeBuyers, noticeList, noticeSummary } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute, type RecordedCall } from "../test/render";

const profile: CompanyView = {
  id: companyUser.company!.id,
  org_number: null,
  name: "Målerifirman i Matfors AB",
  description: "Invändig och utvändig målning.",
  cpv_codes: ["45442100", "45442110"],
  cpv_labels: { "45442100": "Målning", "45442110": "Målning av byggnader" },
  municipalities: ["Sundsvall", "Timrå"],
  employees: 4,
  annual_turnover_sek: 3_000_000,
  certifications: [],
  insurance: "Ansvarsförsäkring 5 000 000 kr",
  public_references: null,
  is_fictitious: true,
};

const upcoming: UpcomingProcurement = {
  agreement_id: "3c2b1a0f-9e8d-4c7b-a6f5-e4d3c2b1a0f9",
  title: "Ramavtal måleriarbeten",
  category: "Bygg och fastighet",
  cpv_codes: ["45442100"],
  end_date: "2027-11-30",
  max_end_date: null,
  expected_from: "2027-02-28",
  expected_to: "2027-05-30",
  previous_requirements: null,
  is_fictitious: true,
  relevant_for_company: true,
  announcement_overdue: false,
};

function routes(user: UserView | null, notices: MockRoute["body"], companyProfile: CompanyView = profile): MockRoute[] {
  const company: MockRoute[] =
    user?.role === "foretagare"
      ? [
          { method: "GET", path: "/api/profile", body: companyProfile },
          { method: "GET", path: "/api/matches", body: [matchView] },
        ]
      : [];
  return [
    ...baseRoutes(user),
    { method: "GET", path: "/api/notices", body: notices },
    { method: "GET", path: "/api/notices/buyers", body: noticeBuyers },
    { method: "GET", path: "/api/upcoming", body: [upcoming] },
    ...company,
  ];
}

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

function buyerCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.path === "/api/notices/buyers");
}

function noticeCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.path === "/api/notices");
}

function lastNoticeSearch(calls: RecordedCall[]): string {
  return noticeCalls(calls).at(-1)?.search ?? "";
}

const empty: NoticeList = { items: [], total: 0, counts: { open: 0, planned: 0, all: 3 }, sort: "deadline" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NoticesPage", () => {
  it("lists the open notices first, as linked rows with the deadline, and counts what each status holds", async () => {
    const calls = mockApi(routes(companyUser, noticeList));
    renderApp("/upphandlingar");

    const list = await screen.findByRole("list", { name: "Upphandlingar" });
    const row = within(list).getByRole("listitem");
    expect(within(row).getByRole("link", { name: noticeSummary.title })).toHaveAttribute(
      "href",
      `/upphandlingar/${noticeSummary.id}`,
    );
    expect(within(row).getByText("26 okt")).toBeInTheDocument();
    expect(within(row).getByText("Passar delvis")).toBeInTheDocument();
    expect(within(row).queryByText("Öppen för anbud")).not.toBeInTheDocument();

    expect(screen.getByRole("radio", { name: "Öppna 1" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Planerade 0" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Alla 1" })).not.toBeChecked();
    expect(screen.getByText("1 öppen upphandling")).toBeInTheDocument();
    expect(lastNoticeSearch(calls)).toContain("status=open");
    expect(lastNoticeSearch(calls)).not.toContain("sort=");
  });

  it("switches status with the segmented control and asks the backend for it", async () => {
    const calls = mockApi(routes(null, noticeList));
    renderApp("/upphandlingar");

    await userEvent.click(await screen.findByRole("radio", { name: "Alla 1" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).not.toContain("status="));
    expect(screen.getByRole("radio", { name: "Alla 1" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Planerade 0" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("status=planned"));
  });

  it("searches as the user types and offers to clear the filters when nothing matches", async () => {
    const calls = mockApi(routes(null, empty));
    renderApp("/upphandlingar");

    expect(await screen.findByRole("heading", { name: "Inga öppna upphandlingar just nu" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Sök bland upphandlingar" }), "fönster");
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("q=f%C3%B6nster"));
    expect(await screen.findByRole("heading", { name: "Inga upphandlingar matchar sökningen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visa alla (3)" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Rensa filter" }));
    expect(screen.getByRole("textbox", { name: "Sök bland upphandlingar" })).toHaveValue("");
    await waitFor(() => expect(lastNoticeSearch(calls)).not.toContain("q="));
  });

  it("empties the search field when a link resets the search", async () => {
    const calls = mockApi(routes(null, noticeList));
    renderApp("/upphandlingar");

    const search = await screen.findByRole("textbox", { name: "Sök bland upphandlingar" });
    await userEvent.type(search, "städ");
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("q=st%C3%A4d"));

    const nav = screen.getByRole("navigation", { name: "Huvudmeny" });
    await userEvent.click(within(nav).getByRole("link", { name: "Upphandlingar" }));
    await waitFor(() => expect(search).toHaveValue(""));
    // The old text is not sent again once the debounce has passed.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(lastNoticeSearch(calls)).not.toContain("q=");
  });

  it("goes to the last page instead of an empty list when the page is past the end", async () => {
    const calls: RecordedCall[] = mockApi(
      routes(null, () => {
        const offset = Number(new URLSearchParams(calls.at(-1)?.search).get("offset"));
        return { items: offset < 160 ? [] : [noticeSummary], total: 168, counts: { open: 168, planned: 0, all: 200 }, sort: "deadline" };
      }),
    );
    renderApp("/upphandlingar?sida=50");

    expect(await screen.findByText("Visar 161–168 av 168")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: noticeSummary.title })).toBeInTheDocument();
    expect(screen.queryByText("Inga öppna upphandlingar just nu")).not.toBeInTheDocument();
    expect(calls.some((call) => call.search.includes("offset=160"))).toBe(true);
  });

  it("shows a company only what fits its profile when it asks, using the profile's CPV codes", async () => {
    const calls = mockApi(routes(companyUser, noticeList));
    renderApp("/upphandlingar");

    const toggle = await screen.findByRole("switch", { name: "Visa bara det som passar er" });
    expect(screen.getByText("Utgår från er profil: Målning, Målning av byggnader")).toBeInTheDocument();
    await userEvent.click(toggle);
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("cpv=45442100%2C45442110"));
    expect(await screen.findByText("1 öppen upphandling verkar passa er")).toBeInTheDocument();
  });

  it("waits for the profile when the address asks for the fit filter, so no unfiltered list is fetched", async () => {
    const calls = mockApi(routes(companyUser, noticeList));
    renderApp("/upphandlingar?passar=1");

    await screen.findByRole("list", { name: "Upphandlingar" });
    expect(noticeCalls(calls).length).toBeGreaterThan(0);
    expect(noticeCalls(calls).every((call) => call.search.includes("cpv=45442100%2C45442110"))).toBe(true);
    expect(screen.getByRole("switch", { name: "Visa bara det som passar er" })).toBeChecked();
  });

  it("tells a company without CPV codes in its profile where to add them", async () => {
    mockApi(routes(companyUser, noticeList, { ...profile, cpv_codes: [], cpv_labels: {} }));
    renderApp("/upphandlingar");

    expect(await screen.findByRole("link", { name: "företagsprofilen" })).toHaveAttribute("href", "/profil");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("sorts as the address asks, and the reader can choose another order", async () => {
    const other = { ...noticeSummary, id: "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b", title: "Städtjänster för förskolor" };
    const calls = mockApi(routes(null, { ...noticeList, items: [noticeSummary, other], total: 2, sort: "published" }));
    renderApp("/upphandlingar?status=alla&sortera=publicerad");

    expect(await screen.findByText("2 upphandlingar · senast publicerade först")).toBeInTheDocument();
    expect(lastNoticeSearch(calls)).toContain("sort=published");
    expect(lastNoticeSearch(calls)).not.toContain("status=");

    await userEvent.click(screen.getByRole("combobox", { name: "Sortera" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sista anbudsdag" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("sort=deadline"));
  });

  it("filters on the source from Fler filter and shows the choice as a chip that removes it", async () => {
    const calls = mockApi(routes(null, noticeList));
    renderApp("/upphandlingar");

    await userEvent.click(await screen.findByRole("button", { name: "Fler filter" }));
    const source = await screen.findByRole("combobox", { name: "Källa" });
    expect(source).toHaveTextContent("Alla källor");
    await userEvent.click(source);
    await userEvent.click(await screen.findByRole("option", { name: "TED" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("source=ted"));

    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Ta bort Källa: TED" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).not.toContain("source="));
  });

  it("filters on a buyer from Fler filter, counted with the list's other filters, and shows it as a chip", async () => {
    const calls = mockApi(routes(null, noticeList));
    renderApp("/upphandlingar?kalla=ted");

    await screen.findByRole("list", { name: "Upphandlingar" });
    // The buyers are asked for only once the popover is open.
    expect(buyerCalls(calls)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Fler filter" }));
    const buyer = await screen.findByRole("combobox", { name: "Köpare" });
    await waitFor(() => expect(buyerCalls(calls).at(-1)?.search).toBe("?status=open&source=ted"));
    expect(buyer).toHaveTextContent("Alla köpare");

    await userEvent.click(buyer);
    await userEvent.click(await screen.findByRole("option", { name: "Timrå kommun (2)" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("buyer=Timr%C3%A5+kommun"));
    expect(await screen.findByText("1 öppen upphandling från Timrå kommun")).toBeInTheDocument();
    expect(lastNoticeSearch(calls)).toContain("source=ted");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Ta bort Köpare: Timrå kommun" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).not.toContain("buyer="));
    // The chip's button is gone: the focus waits on Fler filter, where the buyer can be chosen again.
    expect(screen.getByRole("button", { name: "Fler filter" })).toHaveFocus();
  });

  it("keeps a buyer from the address chosen while the choices do not list it, and clears it", async () => {
    const calls = mockApi(routes(null, empty));
    renderApp("/upphandlingar?kopare=Ume%C3%A5+kommun");

    expect(await screen.findByRole("heading", { name: "Inga upphandlingar matchar sökningen" })).toBeInTheDocument();
    expect(lastNoticeSearch(calls)).toContain("buyer=Ume%C3%A5+kommun");
    await userEvent.click(screen.getByRole("button", { name: "Fler filter" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Köpare" })).toHaveTextContent("Umeå kommun (0)"));

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Rensa filter" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).not.toContain("buyer="));
    expect(screen.queryByRole("button", { name: /Ta bort Köpare/ })).not.toBeInTheDocument();
  });

  it("keeps a phone's filter area short: the order is in the popover and the profile's codes are left out", async () => {
    asPhone();
    const other = { ...noticeSummary, id: "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b", title: "Städtjänster för förskolor" };
    const calls = mockApi(routes(companyUser, { ...noticeList, items: [noticeSummary, other], total: 2 }));
    renderApp("/upphandlingar");

    expect(await screen.findByText("2 öppna upphandlingar · närmast sista anbudsdag först")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Visa bara det som passar er" })).toBeInTheDocument();
    expect(screen.queryByText(/Utgår från er profil/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kommunens och regionens upphandlingar/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Sortera" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Filter och sortering" }));
    const order = await screen.findByRole("combobox", { name: "Sortera" });
    expect(order).toHaveTextContent("Sista anbudsdag");
    await userEvent.click(order);
    expect(screen.queryByRole("option", { name: "Bäst träff" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: "Senast publicerad" }));
    await waitFor(() => expect(lastNoticeSearch(calls)).toContain("sort=published"));
    expect(screen.getByRole("combobox", { name: "Källa" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Köpare" })).toBeInTheDocument();
  });

  it("invites a visitor to log in to see what fits, and shows what is coming", async () => {
    mockApi(routes(null, noticeList));
    renderApp("/upphandlingar");

    const rail = await screen.findByRole("complementary", { name: "Mer om upphandlingarna" });
    expect(within(rail).getByRole("heading", { name: "Logga in för att se vad som passar ert företag" })).toBeInTheDocument();
    expect(within(rail).getByRole("link", { name: "Logga in" })).toHaveAttribute(
      "href",
      `/logga-in?till=${encodeURIComponent("/upphandlingar")}`,
    );
    expect(await within(rail).findByText("Ramavtal måleriarbeten")).toBeInTheDocument();
    // The period on two lines, the same break on every row: the months, then the year.
    expect(within(rail).getByText("feb–maj")).toBeInTheDocument();
    expect(within(rail).getByText("2027")).toBeInTheDocument();
    expect(within(rail).queryByRole("link", { name: "Se alla på Start" })).not.toBeInTheDocument();
  });

  it("shows a company the notices its matches say fit, with the way to Start", async () => {
    mockApi(routes(companyUser, noticeList));
    renderApp("/upphandlingar");

    const rail = await screen.findByRole("complementary", { name: "För ert företag" });
    expect(await within(rail).findByRole("heading", { name: "Passar er, 1 upphandling" })).toBeInTheDocument();
    expect(within(rail).getByText("1 öppen upphandling verkar passa Målerifirman i Matfors AB.")).toBeInTheDocument();
    expect(within(rail).getByRole("link", { name: noticeSummary.title })).toHaveAttribute(
      "href",
      `/upphandlingar/${noticeSummary.id}`,
    );
    expect(within(rail).getByRole("link", { name: "Se träffarna på Start" })).toHaveAttribute("href", "/start");
    expect(await within(rail).findByRole("link", { name: "Se alla på Start" })).toHaveAttribute("href", "/start#kommande");
  });
});
