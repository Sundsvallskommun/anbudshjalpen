import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UpcomingProcurement } from "../api/types";
import { companyUser } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";

const upcoming: UpcomingProcurement = {
  agreement_id: "3c2b1a0f-9e8d-4c7b-a6f5-e4d3c2b1a0f9",
  title: "Ramavtal måleriarbeten",
  category: "Bygg och fastighet",
  cpv_codes: ["45442100"],
  end_date: "2027-12-05",
  max_end_date: null,
  expected_from: "2027-03-05",
  expected_to: "2027-06-05",
  previous_requirements: null,
  is_fictitious: true,
  relevant_for_company: true,
  announcement_overdue: false,
};

describe("WatchPage upcoming procurements", () => {
  it("says when a procurement should already have been announced, and where to look", async () => {
    const overdue: UpcomingProcurement = {
      ...upcoming,
      agreement_id: "4d3c2b1a-0f9e-4d8c-b7a6-f5e4d3c2b1a0",
      title: "Livsmedel frukt och grönt",
      end_date: "2027-01-31",
      expected_from: "2026-04-30",
      expected_to: "2026-07-31",
      announcement_overdue: true,
    };
    mockApi([
      ...baseRoutes(companyUser),
      { method: "GET", path: "/api/matches", body: [] },
      { method: "GET", path: "/api/upcoming", body: [overdue, upcoming] },
    ]);
    renderApp("/bevakning");

    const late = (await screen.findByRole("heading", { level: 3, name: overdue.title })).closest("li")!;
    expect(within(late).getByText("Borde redan ha annonserats")).toBeInTheDocument();
    expect(within(late).getByRole("link", { name: "Sök bland de öppna annonserna" })).toHaveAttribute(
      "href",
      "/upphandlingar?status=open",
    );
    expect(within(late).queryByText("Väntas annonseras:")).not.toBeInTheDocument();

    const coming = screen.getByRole("heading", { level: 3, name: upcoming.title }).closest("li")!;
    expect(within(coming).getByText("Väntas annonseras:")).toBeInTheDocument();
    expect(within(coming).queryByText("Borde redan ha annonserats")).not.toBeInTheDocument();
  });
});
