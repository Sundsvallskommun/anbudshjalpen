import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { companyUser, noticeList, noticeSummary } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";

describe("NoticesPage", () => {
  it("lists notices with fit, status and the fictitious mark", async () => {
    mockApi([...baseRoutes(companyUser), { method: "GET", path: "/api/notices", body: noticeList }]);
    renderApp("/");

    expect(await screen.findByRole("link", { name: noticeSummary.title })).toHaveAttribute(
      "href",
      `/upphandlingar/${noticeSummary.id}`,
    );
    expect(screen.getByText("1 upphandling")).toBeInTheDocument();
    expect(screen.getByText("Passar delvis")).toBeInTheDocument();
    expect(screen.getByText("Öppen för anbud")).toBeInTheDocument();
    expect(screen.getByText("Checklista finns")).toBeInTheDocument();
    expect(screen.getByText("Fiktiv")).toBeInTheDocument();
  });

  it("searches as the user types and offers to clear filters when nothing matches", async () => {
    const calls = mockApi([
      ...baseRoutes(null),
      { method: "GET", path: "/api/notices", body: { items: [], total: 0 } },
    ]);
    renderApp("/");

    await userEvent.type(await screen.findByRole("textbox", { name: "Sök" }), "fönster");
    await waitFor(() => expect(calls.some((call) => call.search.includes("q=f%C3%B6nster"))).toBe(true));
    expect(await screen.findByText("Inga upphandlingar matchar sökningen")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Rensa filter" }));
    expect(screen.getByRole("textbox", { name: "Sök" })).toHaveValue("");
  });

  it("empties the search field when a link resets the search", async () => {
    const calls = mockApi([...baseRoutes(null), { method: "GET", path: "/api/notices", body: noticeList }]);
    renderApp("/");

    const search = await screen.findByRole("textbox", { name: "Sök" });
    await userEvent.type(search, "städ");
    await waitFor(() => expect(calls.some((call) => call.search.includes("q=st%C3%A4d"))).toBe(true));

    const nav = screen.getByRole("navigation", { name: "Huvudmeny" });
    await userEvent.click(within(nav).getByRole("link", { name: "Upphandlingar" }));
    await waitFor(() => expect(search).toHaveValue(""));
    // The old text is not sent again once the debounce has passed.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls.at(-1)?.search).not.toContain("q=");
  });

  it("goes to the last page instead of an empty list when the page is past the end", async () => {
    const calls = mockApi([
      ...baseRoutes(null),
      {
        method: "GET",
        path: "/api/notices",
        body: () => {
          const offset = Number(new URLSearchParams(calls.at(-1)?.search).get("offset"));
          return { items: offset < 160 ? [] : [noticeSummary], total: 168 };
        },
      },
    ]);
    renderApp("/?sida=50");

    expect(await screen.findByText("Sida 9 av 9")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: noticeSummary.title })).toBeInTheDocument();
    expect(screen.queryByText("Inga upphandlingar ännu")).not.toBeInTheDocument();
    expect(calls.some((call) => call.search.includes("offset=160"))).toBe(true);
  });
});
