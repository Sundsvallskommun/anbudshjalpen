import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Link } from "@astryxdesign/core/Link";
import { mockApi } from "../../test/render";
import { CollapsibleSection } from "./CollapsibleSection";
import { renderWithProviders } from "./testing";

describe("CollapsibleSection", () => {
  it("is a heading whose button names the count, open when asked", async () => {
    mockApi([]);
    renderWithProviders(
      <CollapsibleSection id="skallkrav" title="Skallkrav" count={11} countNoun={["krav", "krav"]} helper="Måste vara uppfyllda." defaultOpen>
        <p>Raderna</p>
      </CollapsibleSection>,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    const button = within(heading).getByRole("button", { name: "Skallkrav, 11 krav" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleDescription("Måste vara uppfyllda.");
    expect(screen.getByText("Raderna")).toBeVisible();

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Raderna")).not.toBeVisible();
    expect(screen.getByRole("region", { name: "Skallkrav, 11 krav" })).toHaveAttribute("id", "skallkrav");
  });

  it("opens when the address names the section itself, also on arrival", async () => {
    mockApi([]);
    renderWithProviders(
      <>
        <Link href="#bilagor">5 bilagor</Link>
        <CollapsibleSection id="uppdraget" title="Krav på uppdraget" count={1} countNoun={["krav", "krav"]}>
          <p>Kravet</p>
        </CollapsibleSection>
        <CollapsibleSection id="bilagor" title="Bilagor att lämna in" count={5} countNoun={["bilaga", "bilagor"]}>
          <p>Bilagorna</p>
        </CollapsibleSection>
      </>,
      { path: "/upphandlingar/1?flik=checklista#uppdraget" },
    );
    expect(screen.getByRole("button", { name: "Krav på uppdraget, 1 krav" })).toHaveAttribute("aria-expanded", "true");
    // The reader lands on the section once it is open.
    await waitFor(() => expect(screen.getByRole("region", { name: "Krav på uppdraget, 1 krav" })).toHaveFocus());
    const attachments = screen.getByRole("button", { name: "Bilagor att lämna in, 5 bilagor" });
    expect(attachments).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(screen.getByRole("link", { name: "5 bilagor" }));
    expect(attachments).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Bilagorna")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("region", { name: "Bilagor att lämna in, 5 bilagor" })).toHaveFocus());
  });

  it("shows a row inside a closed section on arrival, once the section is open", async () => {
    mockApi([]);
    renderWithProviders(
      <CollapsibleSection id="uppdraget" title="Krav på uppdraget" count={1} countNoun={["krav", "krav"]}>
        <p id="krav-K14">Kravet</p>
      </CollapsibleSection>,
      { path: "/upphandlingar/1#krav-K14" },
    );
    expect(screen.getByRole("button", { name: "Krav på uppdraget, 1 krav" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByText("Kravet")).toHaveFocus());
  });

  it("opens when a link points at something inside it", async () => {
    mockApi([]);
    renderWithProviders(
      <>
        <Link href="#krav-K12">Till kravet</Link>
        <CollapsibleSection id="uppdraget" title="Krav på uppdraget" count={1} countNoun={["krav", "krav"]}>
          <p id="krav-K12">Kravet</p>
        </CollapsibleSection>
      </>,
    );
    const button = screen.getByRole("button", { name: "Krav på uppdraget, 1 krav" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("link", { name: "Till kravet" }));
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
