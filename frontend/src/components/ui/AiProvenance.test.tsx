import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/render";
import { AiProvenance } from "./AiProvenance";
import { renderWithProviders } from "./testing";

const verification = { citations_total: 86, citations_verified: 86, citations_moved: 0, citations_unverified: 0 };

describe("AiProvenance", () => {
  it("says once who reviewed the content and how the sources held up", () => {
    mockApi([]);
    renderWithProviders(<AiProvenance engine="heuristic" reviewedAt="2026-10-05T10:00:00+02:00" verification={verification} />);
    expect(screen.getByText("Granskad av inköp 5 okt 2026")).toBeInTheDocument();
    expect(screen.getByText("Alla 86 källhänvisningar hittades i underlaget ·")).toBeInTheDocument();
  });

  it("keeps every dot with the words before it, so a wrapped line never starts with one", () => {
    mockApi([]);
    renderWithProviders(
      <AiProvenance
        engine="heuristic"
        reviewedAt="2026-10-05T10:00:00+02:00"
        verification={{ citations_total: 4, citations_verified: 3, citations_moved: 1, citations_unverified: 0 }}
      />,
    );
    // The line as shown, up to the popover's trigger; the popover's own text follows it in the DOM.
    const shown = screen.getByText("Granskad av inköp 5 okt 2026").parentElement!.textContent!.split("Hur togs det här fram?")[0]!;
    expect(shown.match(/\u00a0·/gu)).toHaveLength(3);
    expect(shown).not.toMatch(/ ·/u);
  });

  it("says when nobody has reviewed it, and names the engine once in the popover", async () => {
    mockApi([]);
    renderWithProviders(<AiProvenance engine="eneo" howLabel="Hur togs svaret fram?" />);
    expect(screen.getByText("Automatiskt framtaget")).toBeInTheDocument();
    expect(screen.getByText("inte granskat av inköp ·")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hur togs svaret fram?" }));
    const popover = await screen.findByRole("dialog", { name: "Hur togs svaret fram?" });
    expect(within(popover).getByText(/AI via Eneo/)).toBeInTheDocument();
    expect(within(popover).getByText(/Inköp har inte granskat det här/)).toBeInTheDocument();
    expect(within(popover).queryByText(/språkmodell/)).not.toBeInTheDocument();
  });

  it("explains an answer from the law in the law's terms, never the procurement documents'", async () => {
    mockApi([]);
    renderWithProviders(<AiProvenance engine="heuristic" basis="law" howLabel="Hur togs svaret fram?" />);
    expect(screen.getByText("inte granskat av inköp ·")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hur togs svaret fram?" }));
    const popover = await screen.findByRole("dialog", { name: "Hur togs svaret fram?" });
    expect(
      within(popover).getByText(/Regelhjälpen letar upp paragrafer i lagen om offentlig upphandling \(LOU\)/),
    ).toBeInTheDocument();
    expect(within(popover).getByText(/med lagens egna ord, ur Anbudsklars egen kopia av LOU/)).toBeInTheDocument();
    expect(within(popover).getByText("Inköp har inte granskat det här. Läs alltid hela paragrafen.")).toBeInTheDocument();
    expect(within(popover).getByText("Det är alltid lagtexten som gäller.")).toBeInTheDocument();
    expect(within(popover).queryByText(/underlaget/)).not.toBeInTheDocument();
  });
});
