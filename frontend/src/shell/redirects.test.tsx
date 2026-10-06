import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buyerUser, companyUser, session } from "../test/fixtures";
import { mockApi } from "../test/render";
import { renderWithProviders } from "../components/ui/testing";
import { HomeRedirect, KeepQueryRedirect } from "./redirects";

function sessionRoute(user: typeof companyUser | null) {
  return { method: "GET" as const, path: "/api/session", body: session(user) };
}

describe("HomeRedirect", () => {
  it.each([
    [companyUser, "/start?status=open"],
    [buyerUser, "/inkop?status=open"],
    [null, "/upphandlingar?status=open"],
  ])("takes each role to where it starts, keeping the query", async (user, expected) => {
    mockApi([sessionRoute(user)]);
    renderWithProviders(<HomeRedirect />, { path: "/?status=open" });
    expect(await screen.findByText(expected)).toBe(screen.getByTestId("location"));
  });
});

describe("KeepQueryRedirect", () => {
  it("moves an old address and keeps its query and hash, as the mails link there", async () => {
    mockApi([]);
    renderWithProviders(<KeepQueryRedirect to="/start" />, { path: "/bevakning?fran=mejl#traffar" });
    expect(await screen.findByText("/start?fran=mejl#traffar")).toBeInTheDocument();
  });
});
