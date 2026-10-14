import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "@astryxdesign/core/Button";
import { mockApi } from "../../test/render";
import { parseStep, StepNav, useStepNav } from "./StepNav";
import { renderWithProviders } from "./testing";

function Counter() {
  const [count, setCount] = useState(0);
  return <Button label={`Räknat ${count}`} onClick={() => setCount(count + 1)} />;
}

function AskButton() {
  const { goTo } = useStepNav();
  return <Button label="Granska med en fråga" onClick={() => goTo("granska", { fraga: "Hur många referenser?" })} />;
}

const panels = {
  checklista: () => (
    <>
      <Counter />
      <AskButton />
    </>
  ),
  granska: () => <p>Granskningen</p>,
};

describe("StepNav", () => {
  it("shows the two steps and the one the address asks for", () => {
    mockApi([]);
    renderWithProviders(<StepNav panels={panels} />, { path: "/upphandlingar/1?flik=granska" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent?.replace(/\d/gu, ""))).toEqual(
      expect.arrayContaining([expect.stringContaining("Krav")]),
    );
    expect(screen.getByRole("tab", { name: "Granska" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Granska" })).toBeVisible();
    expect(parseStep("okänd")).toBe("checklista");
    // The address of the step "Lämna in" from before decision 0024 opens the last step.
    expect(parseStep("inlamning")).toBe("granska");
  });

  it("puts the step in the address and keeps a visited step's state", async () => {
    mockApi([]);
    renderWithProviders(<StepNav panels={panels} marks={{ granska: "warning" }} />, { path: "/upphandlingar/1" });

    await userEvent.click(screen.getByRole("button", { name: "Räknat 0" }));
    await userEvent.click(screen.getByRole("tab", { name: "Granska, bör åtgärdas" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/upphandlingar/1?flik=granska");
    expect(screen.getByText("Granskningen")).toBeVisible();

    await userEvent.click(screen.getByRole("tab", { name: "Krav" }));
    expect(screen.getByRole("button", { name: "Räknat 1" })).toBeInTheDocument();
    // A mark is said in words, not only shown as an icon.
    expect(screen.getByRole("tab", { name: "Granska, bör åtgärdas" })).toBeInTheDocument();
  });

  it("moves to a step from its own content, with parameters, and focuses its panel", async () => {
    mockApi([]);
    renderWithProviders(<StepNav panels={panels} />, { path: "/upphandlingar/1" });
    await userEvent.click(screen.getByRole("button", { name: "Granska med en fråga" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/flik=granska&fraga=Hur\+m/u);
    expect(screen.getByRole("tabpanel", { name: "Granska" })).toHaveFocus();
  });
});
