import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChecklistStatusToken, FictitiousToken, FitToken, NoticeStatusToken, PublishedChecklistToken, StatusToken } from "./tokens";

describe("status tokens", () => {
  it("words a fit as what the engine can say", () => {
    render(
      <>
        <FitToken fit="passar" />
        <FitToken fit="passar_delvis" />
        <FitToken fit="passar_inte" />
      </>,
    );
    expect(screen.getByText("Verkar passa")).toBeInTheDocument();
    expect(screen.getByText("Passar delvis")).toBeInTheDocument();
    expect(screen.getByText("Verkar inte passa")).toBeInTheDocument();
  });

  it("words a review verdict by what to do, with a count when asked", () => {
    render(
      <>
        <StatusToken status="saknas" count={3} />
        <StatusToken status="obevisat" />
        <StatusToken status="oklart" />
        <StatusToken status="uppfyllt" />
      </>,
    );
    expect(screen.getByText("Hittades inte: 3")).toBeInTheDocument();
    expect(screen.getByText("Bevis saknas")).toBeInTheDocument();
    expect(screen.getByText("Kontrollera själv")).toBeInTheDocument();
    expect(screen.getByText("Ser bra ut")).toBeInTheDocument();
  });

  it("shows no token for the normal open state unless asked, and grey metadata otherwise", () => {
    const { container } = render(<NoticeStatusToken status="open" />);
    expect(container).toBeEmptyDOMElement();
    render(
      <>
        <NoticeStatusToken status="open" showOpen />
        <NoticeStatusToken status="closed" />
        <FictitiousToken />
        <PublishedChecklistToken />
        <ChecklistStatusToken status="draft" />
      </>,
    );
    expect(screen.getByText("Öppen för anbud")).toBeInTheDocument();
    expect(screen.getByText("Stängd")).toBeInTheDocument();
    expect(screen.getByText("Fiktiv").closest("[data-color]")).toHaveAttribute("data-color", "gray");
    expect(screen.getByText("Granskad checklista")).toBeInTheDocument();
    expect(screen.getByText("Utkast")).toBeInTheDocument();
  });
});
