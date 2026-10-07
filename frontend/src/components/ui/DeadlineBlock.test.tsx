import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeadlineBlock } from "./DeadlineBlock";

const now = new Date("2026-10-05T10:00:00+02:00");

describe("DeadlineBlock", () => {
  it("shows the date large with the time and how far away it is", () => {
    render(<DeadlineBlock deadline="2026-11-09T23:59:00+01:00" label="Sista anbudsdag" now={now} />);
    expect(screen.getByText("Sista anbudsdag")).toBeInTheDocument();
    expect(screen.getByText("9 nov")).toBeInTheDocument();
    expect(screen.getByText("kl. 23:59 ·")).toBeInTheDocument();
    expect(screen.getByText("om 35 dagar")).toBeInTheDocument();
    // Screen readers hear the date written out.
    expect(screen.getByText("9 november 2026 kl. 23:59")).toBeInTheDocument();
  });

  it("turns the relative time into a yellow token with a clock at seven days or fewer", () => {
    render(<DeadlineBlock deadline="2026-10-09" label="Sista anbudsdag" variant="compact" now={now} />);
    const token = screen.getByText("om 4 dagar").closest("[data-color]");
    expect(token).toHaveAttribute("data-color", "yellow");
    expect(screen.getByText("Stänger snart:")).toBeInTheDocument();
    // A date has no time of its own.
    expect(screen.queryByText(/kl\./)).not.toBeInTheDocument();
  });

  it("says 'i dag' and 'i morgon' for the nearest days", () => {
    render(
      <>
        <DeadlineBlock deadline="2026-10-05" now={now} />
        <DeadlineBlock deadline="2026-10-06" now={now} />
      </>,
    );
    expect(screen.getByText("i dag")).toBeInTheDocument();
    expect(screen.getByText("i morgon")).toBeInTheDocument();
  });

  it("tones down a passed date, keeps it readable and says so", () => {
    render(<DeadlineBlock deadline="2026-10-01" variant="compact" now={now} />);
    expect(screen.getByText("passerat")).toBeInTheDocument();
    expect(screen.getByText("1 okt")).toHaveAttribute("data-color", "secondary");
  });

  it("fits on one line in the inline variant, with the year when asked", () => {
    render(<DeadlineBlock deadline="2026-11-09T23:59:00+01:00" label="Sista anbudsdag" variant="inline" year="always" now={now} />);
    expect(screen.getByText("9 nov 2026 kl. 23:59")).toBeInTheDocument();
    expect(screen.getByText("om 35 dagar")).toBeInTheDocument();
  });

  it("shows a note above the date where the label is only for screen readers, and hides it from them", () => {
    render(
      <DeadlineBlock
        deadline="2026-10-30T23:59:59+01:00"
        label="Sista dag för anbudsansökan"
        note="Anbudsansökan"
        variant="compact"
        now={now}
      />,
    );
    expect(screen.getByText("Anbudsansökan")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Sista dag för anbudsansökan")).toBeInTheDocument();
  });

  it("leaves the note out where the label is shown", () => {
    render(<DeadlineBlock deadline="2026-10-30" label="Sista dag för anbudsansökan" note="Anbudsansökan" now={now} />);
    expect(screen.queryByText("Anbudsansökan")).not.toBeInTheDocument();
  });
});
