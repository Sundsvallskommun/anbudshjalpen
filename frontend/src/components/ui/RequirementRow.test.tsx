import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Requirement } from "../../api/types";
import { checklistView, NOTICE_ID } from "../../test/fixtures";
import { mockApi } from "../../test/render";
import { requirementAnchor, RequirementRow } from "./RequirementRow";
import { renderWithProviders } from "./testing";

const base = checklistView.checklist.requirements[0]!;

function renderRows(requirements: Requirement[]) {
  mockApi([]);
  return renderWithProviders(
    <ul>
      {requirements.map((requirement) => (
        <RequirementRow key={requirement.id} requirement={requirement} noticeId={NOTICE_ID} origin="Skallkrav" />
      ))}
    </ul>,
  );
}

describe("RequirementRow", () => {
  it("shows the title, the evidence and the source named by the title", () => {
    renderRows([{ ...base, evidence: "Prisbilaga (bilaga 1)" }]);
    expect(screen.getByText(base.title)).toBeInTheDocument();
    expect(screen.getByText("Bevis: Prisbilaga (bilaga 1)").closest(".astryx-token")).not.toBeNull();
    expect(screen.getByRole("link", { name: `Visa källan för ”${base.title}”, s. 4` })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveAttribute("id", requirementAnchor("K1"));
  });

  it("shows the body only when it says more than the title", () => {
    renderRows([
      { ...base, id: "K1", title: "Anbudet är skrivet på svenska", plain_language: "Anbudet är skrivet på svenska.", evidence: null },
      { ...base, id: "K2", title: "Ansvarsförsäkring", plain_language: "Företaget måste visa ett försäkringsbevis.", evidence: null },
    ]);
    expect(screen.getAllByText("Anbudet är skrivet på svenska")).toHaveLength(1);
    expect(screen.queryByText("Anbudet är skrivet på svenska.")).not.toBeInTheDocument();
    expect(screen.getByText("Företaget måste visa ett försäkringsbevis.")).toBeInTheDocument();
  });

  it("writes long evidence as text, since a chip would cut it off", () => {
    const evidence = "Bifoga ett giltigt försäkringsbevis från försäkringsbolaget som visar beloppet.";
    renderRows([{ ...base, evidence }]);
    expect(screen.getByText(`Bevis: ${evidence}`).closest(".astryx-token")).toBeNull();
  });
});
