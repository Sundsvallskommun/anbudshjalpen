import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../components/ui/testing";
import { mockApi } from "../test/render";
import { APPEARANCE_KEY, readAppearance } from "./appearance";
import { AppearanceControl } from "./AppearanceControl";

describe("appearance", () => {
  afterEach(() => localStorage.clear());

  it("follows the device until the visitor chooses, and ignores a value it does not know", () => {
    expect(readAppearance()).toBe("system");
    localStorage.setItem(APPEARANCE_KEY, "dark");
    expect(readAppearance()).toBe("dark");
    localStorage.setItem(APPEARANCE_KEY, "sepia");
    expect(readAppearance()).toBe("system");
  });

  it("turns the whole page dark or light and remembers the choice in this browser", async () => {
    mockApi([]);
    renderWithProviders(<AppearanceControl />);
    expect(screen.getByRole("radio", { name: "Automatiskt" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Mörkt" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe("dark");

    await userEvent.click(screen.getByRole("radio", { name: "Ljust" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe("light");

    // Automatiskt is the default, so nothing is kept for it.
    await userEvent.click(screen.getByRole("radio", { name: "Automatiskt" }));
    expect(localStorage.getItem(APPEARANCE_KEY)).toBeNull();
  });

  it("starts in the stored appearance and says what Automatiskt does where there is room", () => {
    localStorage.setItem(APPEARANCE_KEY, "dark");
    mockApi([]);
    renderWithProviders(<AppearanceControl layout="stacked" />);
    expect(screen.getByRole("radiogroup", { name: "Utseende" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mörkt" })).toBeChecked();
    expect(screen.getByText("Automatiskt följer datorns eller telefonens inställning.")).toBeInTheDocument();
  });
});
