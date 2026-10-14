import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "@astryxdesign/core/Button";
import { mockApi } from "../../test/render";
import { NextStepCard } from "./NextStepCard";
import { ResultSummary } from "./ResultSummary";
import { StatTile } from "./StatTile";
import { renderWithProviders } from "./testing";

describe("StatTile", () => {
  it("is a link named by its figure, and an anchor keeps the page's own parameters", async () => {
    mockApi([]);
    renderWithProviders(<StatTile value={11} label="skallkrav" helper="måste uppfyllas" href="#skallkrav" />, {
      path: "/upphandlingar/1?flik=checklista",
    });
    const link = screen.getByRole("link", { name: "11 skallkrav, måste uppfyllas" });
    expect(link).toHaveAttribute("href", "/upphandlingar/1?flik=checklista#skallkrav");
    await userEvent.click(link);
    expect(screen.getByTestId("location")).toHaveTextContent("/upphandlingar/1?flik=checklista#skallkrav");
  });

  it("is a filter that can be turned on and off", async () => {
    mockApi([]);
    function Filter() {
      const [isSelected, setIsSelected] = useState(false);
      return <StatTile value={3} label="Bör åtgärdas" isSelected={isSelected} onSelectedChange={setIsSelected} />;
    }
    renderWithProviders(<Filter />);
    const filter = screen.getByRole("checkbox", { name: "Visa bara: 3 Bör åtgärdas" });
    expect(filter).not.toBeChecked();
    await userEvent.click(filter);
    expect(filter).toBeChecked();
  });
});

describe("ResultSummary", () => {
  it("leads with the verdict and filters by one figure at a time", async () => {
    mockApi([]);
    const changes: (string | null)[] = [];
    function Summary() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <ResultSummary
          title="3 saker bör åtgärdas innan du lämnar anbudet"
          progress={{ value: 10, max: 21, label: "10 av 21 skall- och kvalificeringskrav ser bra ut" }}
          filters={[
            { value: "atgarda", label: "Bör åtgärdas", count: 3 },
            { value: "kontrollera", label: "Kontrollera själv", count: 8 },
          ]}
          selected={selected}
          onSelectedChange={(value) => {
            changes.push(value);
            setSelected(value);
          }}
        />
      );
    }
    renderWithProviders(<Summary />);
    expect(screen.getByRole("heading", { level: 2, name: "3 saker bör åtgärdas innan du lämnar anbudet" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "10 av 21 skall- och kvalificeringskrav ser bra ut" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Bör åtgärdas/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Kontrollera själv/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Kontrollera själv/ }));
    expect(changes).toEqual(["atgarda", "kontrollera", null]);
  });
});

describe("NextStepCard", () => {
  it("ends a step with one sentence and one action", () => {
    mockApi([]);
    renderWithProviders(
      <NextStepCard text="Undrar du något om kraven?" action={<Button label="Ställ en fråga" variant="primary" />} />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Nästa steg" })).toBeInTheDocument();
    expect(screen.getByText("Undrar du något om kraven?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ställ en fråga" })).toBeInTheDocument();
  });
});
