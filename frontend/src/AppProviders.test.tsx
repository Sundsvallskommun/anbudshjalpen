import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { useToast } from "@astryxdesign/core/Toast";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "./components/ui/testing";
import { mockApi } from "./test/render";

function Notify() {
  const showToast = useToast();
  return (
    <Button
      label="Spara"
      onClick={() => showToast({ body: "Profilen är sparad", endContent: <Link href="/start">Se träffarna</Link> })}
    />
  );
}

describe("AppProviders", () => {
  it("shows toasts in the app's own viewport, with Swedish words and links that stay in the app", async () => {
    const warn = vi.spyOn(console, "warn");
    mockApi([]);
    renderWithProviders(<Notify />);
    await userEvent.click(screen.getByRole("button", { name: "Spara" }));

    // jsdom never shows the viewport's popover, so its content counts as hidden and has no computed name: find the
    // parts by their labels instead of their roles.
    const region = await screen.findByLabelText("Aviseringar");
    expect(region).toHaveAttribute("role", "region");
    expect(within(region).getByText("Profilen är sparad")).toBeInTheDocument();
    expect(within(region).getByLabelText("Stäng avisering")).toBeInTheDocument();
    expect(within(region).getByText("Se träffarna").closest("a")).toHaveAttribute("href", "/start");
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/No LayerProvider found/u));
  });
});
