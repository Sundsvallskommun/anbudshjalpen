import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { companyUser, noticeList, session } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";
import { safeReturnPath } from "./LoginPage";

describe("LoginPage", () => {
  it("is labelled as a demo and logs in with a persona", async () => {
    const calls = mockApi([
      ...baseRoutes(null),
      { method: "POST", path: "/api/session/login", body: session(companyUser) },
      { method: "GET", path: "/api/notices", body: noticeList },
    ]);
    renderApp("/logga-in?till=%2F");

    expect(await screen.findByRole("heading", { level: 1, name: "Logga in (demo)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Logga in som Anna Berg" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Upphandlingar" })).toBeInTheDocument();
    expect(calls.find((call) => call.path === "/api/session/login")?.body).toEqual({ persona: "foretagare" });
  });

  it("only returns to paths inside the app", () => {
    expect(safeReturnPath("/upphandlingar/1?flik=fraga")).toBe("/upphandlingar/1?flik=fraga");
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("https://evil.example")).toBeNull();
    expect(safeReturnPath("/logga-in")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});
