import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buyerUser, checklistAdminItem, companyUser, config, noticeDetail, noticeList, NOTICE_ID } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../test/render";
import { PHONE_QUERY } from "../lib/usePhone";
import { FALLBACK_AI_DISCLOSURE, FALLBACK_DEMO_NOTICE } from "./AboutDemo";
import { STRIP_TEXT, STRIP_TEXT_PHONE } from "./PhaseStrip";
import { READING_TRACE_KEY } from "./readingTrace";

const noticesRoute: MockRoute = { method: "GET", path: "/api/notices", body: noticeList };
const noticeRoute: MockRoute = { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail };

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

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("AppFrame demo strip", () => {
  it("is always one line on every page, and opens the demo and AI details in a dialog", async () => {
    mockApi([...baseRoutes(null), noticesRoute]);
    renderApp("/upphandlingar");

    expect(await screen.findByText(STRIP_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stäng/i })).not.toBeInTheDocument();

    const [stripLink] = screen.getAllByRole("button", { name: "Om demon och AI" });
    await userEvent.click(stripLink!);
    const dialog = await screen.findByRole("dialog", { name: "Om demon och AI" });
    expect(await within(dialog).findByText(config.demo_notice)).toBeInTheDocument();
    expect(within(dialog).getByText(config.ai_disclosure)).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Ladda inte upp riktiga anbud" })).toBeInTheDocument();
    // The engine is named once, in the reader's words.
    expect(within(dialog).getByText(/Motorn i demon just nu är regelbaserad/)).toBeInTheDocument();
    // The text is a named box that joins the tab order when it has to scroll (a small screen); here it fits.
    expect(within(dialog).getByRole("group", { name: "Texten om demon och AI" })).not.toHaveAttribute("tabindex");
  });

  it("offers the demo's trace of the files as a switch kept in this browser", async () => {
    mockApi([...baseRoutes(null), noticesRoute]);
    renderApp("/upphandlingar");

    const [stripLink] = await screen.findAllByRole("button", { name: "Om demon och AI" });
    await userEvent.click(stripLink!);
    const dialog = await screen.findByRole("dialog", { name: "Om demon och AI" });
    expect(await within(dialog).findByRole("heading", { name: "Så lästes underlaget" })).toBeInTheDocument();
    const toggle = within(dialog).getByRole("switch", { name: "Visa hur underlaget lästes" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(localStorage.getItem(READING_TRACE_KEY)).toBe("1");
    await userEvent.click(toggle);
    expect(localStorage.getItem(READING_TRACE_KEY)).toBeNull();
  });

  it("keeps the disclosure when the configuration cannot load", async () => {
    mockApi([{ method: "GET", path: "/api/session", body: { user: null, personas: [] } }, noticesRoute]);
    renderApp("/upphandlingar");

    expect(await screen.findByText(STRIP_TEXT)).toBeInTheDocument();
    const [stripLink] = screen.getAllByRole("button", { name: "Om demon och AI" });
    await userEvent.click(stripLink!);
    const dialog = await screen.findByRole("dialog", { name: "Om demon och AI" });
    expect(within(dialog).getByText(FALLBACK_DEMO_NOTICE)).toBeInTheDocument();
    expect(within(dialog).getByText(FALLBACK_AI_DISCLOSURE)).toBeInTheDocument();
  });

  it("puts the foot after the main region, as the page's one top-level contentinfo", async () => {
    mockApi([...baseRoutes(null), noticesRoute]);
    renderApp("/upphandlingar");

    const foot = await screen.findByRole("contentinfo");
    expect(screen.getByRole("main")).not.toContainElement(foot);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(await within(foot).findByText(config.organization_name)).toBeInTheDocument();
    await userEvent.click(within(foot).getByRole("button", { name: "Om demon och AI" }));
    expect(await screen.findByRole("dialog", { name: "Om demon och AI" })).toBeInTheDocument();
  });

  it("is shorter on a phone, with 'Mer' for the details", async () => {
    asPhone();
    mockApi([...baseRoutes(null), noticesRoute]);
    renderApp("/upphandlingar");

    expect(await screen.findByText(STRIP_TEXT_PHONE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mer om demon och AI" })).toBeInTheDocument();
  });
});

describe("AppFrame navigation", () => {
  it("gives a company Start, Upphandlingar and Regelhjälpen, with the account in the avatar menu", async () => {
    mockApi([...baseRoutes(companyUser), noticesRoute]);
    renderApp("/upphandlingar");

    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(await within(nav).findByRole("link", { name: "Start" })).toHaveAttribute("href", "/start");
    expect(within(nav).getByRole("link", { name: "Regelhjälpen" })).toHaveAttribute("href", "/regelhjalpen");
    expect(within(nav).queryByRole("link", { name: /Inköp/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Bevakning" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Upphandlingar" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(within(nav).getByRole("button", { name: "Konto: Anna Berg, Målerifirman i Matfors AB" }));
    const menu = await screen.findByRole("dialog", { name: "Konto" });
    expect(within(menu).getByRole("link", { name: "Företagsprofil" })).toHaveAttribute("href", "/profil");
    expect(within(menu).getByRole("link", { name: "Påminnelser" })).toHaveAttribute("href", "/paminnelser");
    expect(within(menu).getByRole("button", { name: "Logga ut" })).toBeInTheDocument();
  });

  it("marks the section of a detail page as chosen", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(await within(nav).findByRole("link", { name: "Start" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Upphandlingar" })).toHaveAttribute("aria-current", "page");
  });

  it("gives a buyer Inköp with the number of checklists to review, and Drift in the account menu", async () => {
    mockApi([
      ...baseRoutes(buyerUser),
      noticesRoute,
      { method: "GET", path: "/api/admin/checklists", body: [checklistAdminItem, { ...checklistAdminItem, id: "x", status: "published" }] },
    ]);
    renderApp("/upphandlingar");

    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(await within(nav).findByRole("link", { name: "Inköp, 1 checklista att granska" })).toHaveAttribute(
      "href",
      "/inkop",
    );
    expect(within(nav).queryByRole("link", { name: "Start" })).not.toBeInTheDocument();

    await userEvent.click(within(nav).getByRole("button", { name: "Konto: Lars Holm, Inköp" }));
    const menu = await screen.findByRole("dialog", { name: "Konto" });
    expect(within(menu).getByRole("link", { name: "Drift" })).toHaveAttribute("href", "/inkop/drift");
    expect(within(menu).queryByRole("link", { name: "Företagsprofil" })).not.toBeInTheDocument();
  });

  it("offers a visitor the notices, the rules help and a way to log in and back", async () => {
    mockApi([...baseRoutes(null), noticesRoute]);
    renderApp("/upphandlingar?q=m%C3%A5lning");

    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(within(nav).getByRole("link", { name: "Upphandlingar" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Regelhjälpen" })).toBeInTheDocument();
    // The return address is the page's own, query included, encoded once more as a parameter.
    expect(await within(nav).findByRole("link", { name: "Logga in" })).toHaveAttribute(
      "href",
      `/logga-in?till=${encodeURIComponent("/upphandlingar?q=m%C3%A5lning")}`,
    );
  });

  it("shows a phone the main choices as tabs on a top-level page, without a hamburger", async () => {
    asPhone();
    mockApi([...baseRoutes(companyUser), noticesRoute]);
    renderApp("/upphandlingar");

    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(await within(nav).findByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    // The design system's navigation tabs mark the current one with aria-current="true".
    expect(within(nav).getByRole("link", { name: "Upphandlingar" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: /meny/i })).not.toBeInTheDocument();
  });

  it("shows a phone a back link instead of the choices on a detail page", async () => {
    asPhone();
    mockApi([...baseRoutes(companyUser), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}`);

    expect(await screen.findByRole("link", { name: "Upphandlingar" })).toHaveAttribute("href", "/upphandlingar");
    expect(screen.queryByRole("navigation", { name: "Huvudmeny" })).not.toBeInTheDocument();
  });
});
