import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buyerUser, companyUser } from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../../test/render";
import { REVIEW_LABEL, savedMessage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("shows the review switch and saves a change with what it did", async () => {
    const calls = mockApi([
      ...baseRoutes(buyerUser),
      { method: "GET", path: "/api/admin/settings", body: { review_required: true } },
      { method: "PUT", path: "/api/admin/settings", body: { review_required: false, published_now: 12 } },
    ]);
    renderApp("/inkop/installningar");

    expect(await screen.findByRole("heading", { level: 1, name: "Inställningar" })).toBeInTheDocument();
    const toggle = await screen.findByRole("switch", { name: REVIEW_LABEL });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT" && call.path === "/api/admin/settings")?.body).toEqual({
        review_required: false,
      }),
    );
    expect(
      (await screen.findAllByText("Inställningen är sparad. 12 checklistor som väntade på granskning publicerades."))
        .length,
    ).toBeGreaterThan(0);
  });

  it("is for buyers only", async () => {
    mockApi(baseRoutes(companyUser));
    renderApp("/inkop/installningar");

    expect(await screen.findByRole("heading", { level: 1, name: "Inställningar" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("words the toast by the count", () => {
    expect(savedMessage({ review_required: true, published_now: 0 })).toBe("Inställningen är sparad.");
    expect(savedMessage({ review_required: false, published_now: 1 })).toBe(
      "Inställningen är sparad. 1 checklista som väntade på granskning publicerades.",
    );
  });
});
