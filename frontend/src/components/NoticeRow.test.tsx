import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeSummary } from "../api/types";
import { PHONE_QUERY } from "../lib/usePhone";
import { noticeSummary } from "../test/fixtures";
import { mockApi } from "../test/render";
import { NoticeRow, noticeMeta, noticeOrigin, shortBuyers } from "./NoticeRow";
import { RowList } from "./RowList";
import { renderWithProviders } from "./ui/testing";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Makes the viewport phone-sized for the design system's media queries. */
function asPhone() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === PHONE_QUERY,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

function renderRow(notice: NoticeSummary, isStatusShown = true) {
  mockApi([]);
  renderWithProviders(
    <RowList label="Upphandlingar">
      <NoticeRow notice={notice} isStatusShown={isStatusShown} />
    </RowList>,
  );
  return screen.getByRole("listitem");
}

describe("shortBuyers", () => {
  it("names one or two buyers and counts the rest of a joint procurement", () => {
    expect(shortBuyers("Sundsvalls kommun")).toBe("Sundsvalls kommun");
    expect(shortBuyers("Timrå kommun, Sundsvalls kommun")).toBe("Timrå kommun, Sundsvalls kommun");
    expect(shortBuyers("Timrå kommun, Kramfors kommun, Ånge kommun")).toBe("Timrå kommun + 2 till");
    expect(shortBuyers(null)).toBeNull();
    expect(shortBuyers(" ")).toBeNull();
  });
});

describe("noticeMeta and noticeOrigin", () => {
  it("says who buys, what it is and the source, but no source for the demo's own notices", () => {
    expect(noticeMeta({ buyer: "Mitthem AB", source: "ted", cpv_label: "Snöröjning" })).toBe("Mitthem AB · Snöröjning · TED");
    expect(noticeMeta({ buyer: "Sundsvalls kommun", source: "fixture", cpv_label: "Målning" })).toBe(
      "Sundsvalls kommun · Målning",
    );
    expect(noticeMeta({ buyer: null, source: "eavrop", cpv_label: null })).toBe("e-Avrop");
  });

  it("leaves the category out of the origin, which cards use beside their reasons", () => {
    expect(noticeOrigin({ buyer: "Timrå kommun, Kramfors kommun, Ånge kommun", source: "ted" })).toBe(
      "Timrå kommun + 2 till · TED",
    );
    expect(noticeOrigin({ buyer: "Sundsvalls kommun", source: "fixture" })).toBe("Sundsvalls kommun");
  });
});

describe("NoticeRow", () => {
  it("is one link named by the title, with the facts and the deadline beside it", () => {
    const row = renderRow(noticeSummary);
    const link = within(row).getByRole("link", { name: noticeSummary.title });
    expect(link).toHaveAttribute("href", `/upphandlingar/${noticeSummary.id}`);
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).getByRole("heading", { level: 3, name: noticeSummary.title })).toBeInTheDocument();
    expect(within(row).getByText("Sundsvalls kommun · Målning")).toBeInTheDocument();
    expect(within(row).getByText("Passar delvis")).toBeInTheDocument();
    expect(within(row).getByText("Granskad checklista")).toBeInTheDocument();
    expect(within(row).getByText("Fiktiv")).toBeInTheDocument();
    expect(within(row).getByText("Sista anbudsdag")).toBeInTheDocument();
    expect(within(row).getByText("26 okt")).toBeInTheDocument();
    expect(within(row).getByText("om 21 dagar")).toBeInTheDocument();
    // Being open for tenders is the normal state and gets no token.
    expect(within(row).queryByText("Öppen för anbud")).not.toBeInTheDocument();
  });

  it("marks a notice that is not open, and leaves the mark out when the whole list has that status", () => {
    const planned: NoticeSummary = { ...noticeSummary, status: "planned", deadline_at: null, fit: null };
    const row = renderRow(planned);
    expect(within(row).getByText("Planerad")).toBeInTheDocument();
    expect(within(row).getByText("Datum kommer")).toBeInTheDocument();
    expect(within(row).queryByText("Passar delvis")).not.toBeInTheDocument();
  });

  it("says above the date when it is the last day for anbudsansökan", () => {
    const row = renderRow({ ...noticeSummary, deadline_kind: "request" });
    expect(within(row).getByText("Anbudsansökan")).toBeInTheDocument();
    expect(within(row).getByText("Sista dag för anbudsansökan")).toBeInTheDocument();
    expect(within(row).queryByText("Sista anbudsdag")).not.toBeInTheDocument();
  });

  it("leaves the status out when asked to", () => {
    const row = renderRow({ ...noticeSummary, status: "planned" }, false);
    expect(within(row).queryByText("Planerad")).not.toBeInTheDocument();
  });

  it("stays one link with the same facts on a phone, where the tokens get a line of their own", () => {
    asPhone();
    const row = renderRow(noticeSummary);
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).getByRole("heading", { level: 3, name: noticeSummary.title })).toBeInTheDocument();
    expect(within(row).getByText("Sundsvalls kommun · Målning")).toBeInTheDocument();
    expect(within(row).getByText("26 okt")).toBeInTheDocument();
    const fit = within(row).getByText("Passar delvis");
    // The meta line no longer shares its line with the tokens.
    expect(within(row).getByText("Sundsvalls kommun · Målning").parentElement).not.toContainElement(fit);
    expect(within(row).getByText("Granskad checklista")).toBeInTheDocument();
    expect(within(row).getByText("Fiktiv")).toBeInTheDocument();
  });

  it("gives a phone row without anything to mark no token line", () => {
    asPhone();
    const plain: NoticeSummary = { ...noticeSummary, fit: null, checklist_status: "none", is_fictitious: false };
    const row = renderRow(plain);
    expect(within(row).queryByText("Passar delvis")).not.toBeInTheDocument();
    expect(within(row).queryByText("Fiktiv")).not.toBeInTheDocument();
    expect(within(row).getByText("26 okt")).toBeInTheDocument();
  });
});
