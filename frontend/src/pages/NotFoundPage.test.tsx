import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buyerUser, companyUser } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";

describe("NotFoundPage", () => {
  it("says the page does not exist and leads a visitor to the notices", async () => {
    mockApi(baseRoutes(null));
    renderApp("/finns-inte");

    expect(await screen.findByRole("heading", { level: 1, name: "Sidan finns inte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gå till upphandlingarna" })).toHaveAttribute("href", "/upphandlingar");
  });

  it("leads each role back to where it starts", async () => {
    mockApi(baseRoutes(companyUser));
    const { unmount } = renderApp("/finns-inte");
    expect(await screen.findByRole("link", { name: "Gå till Start" })).toHaveAttribute("href", "/start");
    unmount();

    mockApi(baseRoutes(buyerUser));
    renderApp("/finns-inte");
    expect(await screen.findByRole("link", { name: "Gå till Inköp" })).toHaveAttribute("href", "/inkop");
  });
});
