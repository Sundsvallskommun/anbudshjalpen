import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { config, session } from "../test/fixtures";
import { mockApi, renderApp } from "../test/render";

describe("the gate", () => {
  it("shows nothing but the code until it is typed, then the app", async () => {
    let entered = false;
    const calls = mockApi([
      { method: "GET", path: "/api/config", body: () => ({ ...config, gate_required: !entered }) },
      { method: "GET", path: "/api/session", body: session(null) },
      {
        method: "GET",
        path: "/api/notices",
        body: { items: [], total: 0, counts: { open: 0, planned: 0, all: 0 }, sort: "deadline" },
      },
      {
        method: "POST",
        path: "/api/gate",
        status: 204,
        body: () => {
          entered = true;
          return undefined;
        },
      },
    ]);
    renderApp("/upphandlingar");

    expect(await screen.findByRole("heading", { level: 1, name: "Ange accesskoden" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Upphandlingar" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /Accesskod/ }), "kod123");
    await userEvent.click(screen.getByRole("button", { name: "Fortsätt" }));

    // The page's h1 is remounted when its loading state gives way to the list, so retry the whole check.
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Upphandlingar" })).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(screen.queryByRole("heading", { level: 1, name: "Ange accesskoden" })).not.toBeInTheDocument();
    expect(calls.find((call) => call.path === "/api/gate")?.body).toEqual({ code: "kod123" });
  });

  it("says when the code is wrong", async () => {
    mockApi([
      { method: "GET", path: "/api/config", body: { ...config, gate_required: true } },
      { method: "GET", path: "/api/session", body: session(null) },
      { method: "POST", path: "/api/gate", status: 403, body: { detail: "Fel accesskod." } },
    ]);
    renderApp("/");

    await userEvent.type(await screen.findByRole("textbox", { name: /Accesskod/ }), "fel");
    await userEvent.click(screen.getByRole("button", { name: "Fortsätt" }));

    expect(await screen.findByText("Koden släppte inte in dig")).toBeInTheDocument();
    expect(screen.getByText("Fel accesskod.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Ange accesskoden" })).toBeInTheDocument());
  });
});
