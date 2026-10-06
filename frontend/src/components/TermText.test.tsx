import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TermText } from "./TermText";

describe("TermText", () => {
  it("explains the glossary's words once per text, whichever form comes first", async () => {
    render(<TermText text="Skallkraven måste uppfyllas. Ett skallkrav är inte förhandlingsbart." />);
    const [term, ...others] = screen.getAllByRole("button");
    expect(others).toHaveLength(0);
    expect(term).toHaveTextContent("Skallkraven");
    await userEvent.click(term!);
    const popover = await screen.findByRole("dialog", { name: "Förklaring av Skallkrav" });
    expect(within(popover).getByText(/måste uppfyllas/)).toBeInTheDocument();
  });

  it("lets the document's own explanation win over the glossary's", async () => {
    render(
      <TermText
        text="Avtalsspärr gäller."
        terms={[{ term: "avtalsspärr", explanation: "Underlagets egen förklaring.", citation: null }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Avtalsspärr" }));
    expect(await screen.findByText("Underlagets egen förklaring.")).toBeInTheDocument();
  });

  it("can leave the glossary out", () => {
    render(<TermText text="Skallkrav och ESPD." withGlossary={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
