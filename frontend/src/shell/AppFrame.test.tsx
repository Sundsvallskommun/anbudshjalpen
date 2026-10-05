import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buyerUser, companyUser, config, noticeList } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";

const noticesRoute = { method: "GET" as const, path: "/api/notices", body: noticeList };

describe("AppFrame", () => {
  it("always shows the demo notice and the AI disclosure", async () => {
    mockApi([...baseRoutes(null), noticesRoute]);
    renderApp("/");
    expect(await screen.findByText(config.demo_notice)).toBeInTheDocument();
    expect(screen.getByText(config.ai_disclosure)).toBeInTheDocument();
  });

  it("keeps a disclosure on screen when the configuration cannot load", async () => {
    mockApi([{ method: "GET", path: "/api/session", body: { user: null, personas: [] } }, noticesRoute]);
    renderApp("/");
    expect(await screen.findByText(/Anbudsklar använder AI/)).toBeInTheDocument();
    expect(screen.getByText(/Det här är en demo/)).toBeInTheDocument();
  });

  it("shows the company's destinations to a company user", async () => {
    mockApi([...baseRoutes(companyUser), noticesRoute]);
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(await within(nav).findByRole("link", { name: "Bevakning" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Profil" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Inköp" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Upphandlingar" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the buyer's view to a buyer", async () => {
    mockApi([...baseRoutes(buyerUser), noticesRoute]);
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Huvudmeny" });
    expect(await within(nav).findByRole("link", { name: "Inköp" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Bevakning" })).not.toBeInTheDocument();
  });
});
