import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@astryxdesign/core/Button";
import { mockApi } from "../test/render";
import { renderWithProviders } from "../components/ui/testing";
import { PHONE_QUERY } from "../lib/usePhone";
import { Page } from "./Page";

function renderPage() {
  mockApi([]);
  return renderWithProviders(
    <Page
      title="Ommålning av Solbackens förskola"
      eyebrow="Granska checklista"
      breadcrumbs={[{ label: "Upphandlingar", href: "/upphandlingar" }]}
      actions={<Button label="Ny upphandling" />}
      intro="Sundsvalls kommun · DEMO-2026-0147"
      rail={<p>Railen</p>}
      railLabel="Mer om upphandlingen"
    >
      <p>Innehållet</p>
    </Page>,
  );
}

describe("Page", () => {
  it("frames a page: the way up, the one h1, its actions, the content and the rail", () => {
    renderPage();
    const trail = screen.getByRole("navigation", { name: "Du är här" });
    expect(within(trail).getByRole("link", { name: "Upphandlingar" })).toHaveAttribute("href", "/upphandlingar");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Ommålning av Solbackens förskola" })).toBeInTheDocument();
    expect(screen.getByText("Granska checklista")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ny upphandling" })).toBeInTheDocument();
    expect(screen.getByText("Sundsvalls kommun · DEMO-2026-0147")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Mer om upphandlingen" })).getByText("Railen")).toBeInTheDocument();
    expect(document.title).toBe("Ommålning av Solbackens förskola – Anbudshjälpen");
  });

  it("says its width in the markup, which the frame follows for the review workspace", () => {
    mockApi([]);
    const { container } = renderWithProviders(
      <Page title="Livsmedel – frukt och grönt" width={1344}>
        <p>Granskningsbordet</p>
      </Page>,
    );
    expect(container.querySelector('[data-page-width="1344"]')).toContainElement(screen.getByText("Granskningsbordet"));
  });

  it("leaves the way up to the header's back link on a phone", () => {
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
    renderPage();
    expect(screen.queryByRole("navigation", { name: "Du är här" })).not.toBeInTheDocument();
  });
});
