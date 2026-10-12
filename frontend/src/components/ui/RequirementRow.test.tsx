import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Requirement } from "../../api/types";
import { checklistView, NOTICE_ID, publishedAnswer } from "../../test/fixtures";
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

  it("shows inköp's answer when one changes the requirement, linked to the entry (decision 0018)", () => {
    mockApi([]);
    const changed: Requirement = {
      ...base,
      answer_citation: { answer: 1, quote: "Ja, ställning ingår i anbudspriset.", check: "verified", found_answer: null, answer_key: publishedAnswer.key },
    };
    renderWithProviders(
      <ul>
        <RequirementRow requirement={changed} noticeId={NOTICE_ID} origin="Skallkrav" publishedAnswers={[publishedAnswer]} />
      </ul>,
    );
    expect(screen.getByText("Inköp har svarat om kravet i e-Avrop. Svaret gäller före texten i underlaget.")).toBeInTheDocument();
    expect(screen.getByText("Fråga 1 · Besvarad 30 sep: Ska ställning ingå i priset för fasadmålningen?")).toBeInTheDocument();
    expect(screen.getByText("Ja, ställning ingår i anbudspriset.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Frågor och svar från inköp, fråga 1" })).toHaveAttribute(
      "href",
      `/upphandlingar/${NOTICE_ID}#svar-${"a".repeat(12)}`,
    );
  });

  it("says so when inköp's answer could not be found among the answers", () => {
    mockApi([]);
    const invented: Requirement = {
      ...base,
      answer_citation: { answer: 4, quote: "Påslaget slopas.", check: "unverified", found_answer: null, answer_key: null },
    };
    renderWithProviders(
      <ul>
        <RequirementRow requirement={invented} noticeId={NOTICE_ID} publishedAnswers={[publishedAnswer]} />
      </ul>,
    );
    expect(screen.getByText("Hittades inte bland inköps svar")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Frågor och svar från inköp/u })).not.toBeInTheDocument();
  });

  it("says so when inköp's answer has since been withdrawn in e-Avrop", () => {
    mockApi([]);
    const withdrawn: Requirement = {
      ...base,
      answer_citation: { answer: 1, quote: "Ja.", check: "verified", found_answer: null, answer_key: "z".repeat(64) },
    };
    renderWithProviders(
      <ul>
        <RequirementRow requirement={withdrawn} noticeId={NOTICE_ID} publishedAnswers={[publishedAnswer]} />
      </ul>,
    );
    expect(screen.getByText("Svaret finns inte längre bland inköps svar")).toBeInTheDocument();
  });
});
