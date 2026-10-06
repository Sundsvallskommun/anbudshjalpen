import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Citation, NoticeDetail } from "../../../api/types";
import {
  checklistView,
  companyUser,
  DOCUMENT_ID,
  matchView,
  NOTICE_ID,
  noticeDetail,
  pageFour,
  session,
} from "../../../test/fixtures";
import { mockApi, type MockRoute } from "../../../test/render";
import { renderWithProviders } from "../testing";
import { useSourceDeepLink } from "./SourceDialogProvider";
import { SourceLink } from "./SourceLink";
import { primaryDocumentId, sourceHref, targetFromParams } from "./sourceTarget";

const verified: Citation = { page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null };
const claim = "Ni har ansvarsförsäkring";

const routes: MockRoute[] = [
  { method: "GET", path: "/api/session", body: session(companyUser) },
  { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail },
  { method: "GET", path: `/api/notices/${NOTICE_ID}/documents/${DOCUMENT_ID}/pages/4`, body: pageFour },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SourceLink", () => {
  it("is a quiet 's. 4' named by the claim it backs, linking to the source", () => {
    mockApi(routes);
    renderWithProviders(<SourceLink noticeId={NOTICE_ID} citation={verified} claim={claim} />);
    const link = screen.getByRole("link", { name: "Visa källan för ”Ni har ansvarsförsäkring”, s. 4" });
    expect(link).toHaveTextContent("s. 4");
    expect(link).toHaveAttribute("href", sourceHref(NOTICE_ID, verified, claim));
  });

  it("puts words only on deviations: another page, or not found", () => {
    mockApi(routes);
    renderWithProviders(
      <>
        <SourceLink noticeId={NOTICE_ID} citation={{ ...verified, page: 5, check: "moved", found_page: 6 }} claim="A" />
        <SourceLink noticeId={NOTICE_ID} citation={{ ...verified, check: "unverified" }} claim="B" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Visa källan för ”A”, s. 6 (AI angav 5)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visa källan för ”B”, Hittades inte i underlaget" })).toBeInTheDocument();
  });

  it("opens the source dialog with the claim, the check in words and the quote marked", async () => {
    mockApi(routes);
    renderWithProviders(<SourceLink noticeId={NOTICE_ID} citation={verified} claim={claim} origin="Därför verkar den passa" />, {
      path: "/start",
    });

    await userEvent.click(screen.getByRole("link", { name: /^Visa källan för/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(await within(dialog).findByText("Citatet står på sida 4 och är markerat nedan.")).toBeInTheDocument();
    expect(within(dialog).getByText("Påståendet")).toBeInTheDocument();
    expect(within(dialog).getByText(claim)).toBeInTheDocument();
    expect(within(dialog).getByText(`Från: Därför verkar den passa · ${noticeDetail.title}`)).toBeInTheDocument();
    expect(within(dialog).getByText(noticeDetail.documents[0]!.filename)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Ladda ned underlaget" })).toHaveAttribute(
      "href",
      `/api/documents/${DOCUMENT_ID}/file`,
    );

    const mark = dialog.querySelector("mark");
    expect(mark).toHaveTextContent("Leverantören ska ha en ansvarsförsäkring");
    // Marked on the page, the quote is not repeated above it.
    expect(within(dialog).queryByText("Citatet som AI:n angav")).not.toBeInTheDocument();
    // The mark's boundaries are words too, not only colour.
    expect(within(dialog).getByText("Markerat citat:")).toBeInTheDocument();
    expect(within(dialog).getByText("slut på citatet")).toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "Sida 4 av 16 i underlaget" })).toBeInTheDocument();

    // The formal way to an answer every supplier gets, with the checklist's frågestopp.
    expect(within(dialog).getByText(/Ställ frågan i/)).toBeInTheDocument();
    expect(within(dialog).getByText(/senast 16 okt\.$/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "e-Avrop" })).toBeInTheDocument();
    // Opened away from the notice, the dialog offers the way there.
    expect(within(dialog).getByRole("link", { name: "Öppna upphandlingen" })).toHaveAttribute("href", `/upphandlingar/${NOTICE_ID}`);
  });

  it("shows the cited words when the page does not have them", async () => {
    mockApi(routes);
    const missing: Citation = { page: 4, quote: "Referensuppdrag i offentlig miljö", check: "unverified", found_page: null };
    renderWithProviders(<SourceLink noticeId={NOTICE_ID} citation={missing} claim="Två referensuppdrag" />);

    await userEvent.click(screen.getByRole("link", { name: /^Visa källan för/ }));
    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(await within(dialog).findByText("Citatet hittades inte i underlaget. Sida 4 visas utan markering.")).toBeInTheDocument();
    expect(within(dialog).getByText("”Referensuppdrag i offentlig miljö”")).toBeInTheDocument();
    expect(within(dialog).getByText("Citatet som AI:n angav")).toBeInTheDocument();
    expect(dialog.querySelector("mark")).toBeNull();
  });

  it("keeps the address for a click that asks for a new tab", () => {
    mockApi(routes);
    renderWithProviders(<SourceLink noticeId={NOTICE_ID} citation={verified} claim={claim} />);
    const link = screen.getByRole("link", { name: /^Visa källan för/ });
    const event = fireEvent.click(link, { ctrlKey: true });
    // fireEvent returns false when the default was prevented.
    expect(event).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Källan i underlaget" })).not.toBeInTheDocument();
  });
});

function DeepLinked({ notice }: { notice: NoticeDetail }) {
  useSourceDeepLink(notice);
  return null;
}

describe("source addresses", () => {
  it("open the dialog on the notice page and leave the address clean", async () => {
    mockApi(routes);
    const path = `${sourceHref(NOTICE_ID, verified, claim)}&flik=checklista`;
    renderWithProviders(<DeepLinked notice={noticeDetail} />, { path });

    const dialog = await screen.findByRole("dialog", { name: "Källan i underlaget" });
    expect(await within(dialog).findByText("Citatet står på sida 4 och är markerat nedan.")).toBeInTheDocument();
    expect(within(dialog).getByText(claim)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(`/upphandlingar/${NOTICE_ID}?flik=checklista`);
    // On the notice page itself there is no link to it.
    expect(within(dialog).queryByRole("link", { name: "Öppna upphandlingen" })).not.toBeInTheDocument();
  });

  it("take a quote's check from the notice, never from the address", () => {
    const moved = checklistView.checklist.requirements[1]!.citation;
    const target = targetFromParams(new URLSearchParams(`citat=${moved.quote}&sida=6`), noticeDetail);
    expect(target).toMatchObject({ kind: "source", citation: moved });

    const unknown = targetFromParams(new URLSearchParams("citat=Något som inte finns&sida=3&pastaende=X"), noticeDetail);
    expect(unknown).toMatchObject({ kind: "source", claim: "X", citation: { page: 3, check: null } });

    expect(targetFromParams(new URLSearchParams("flik=underlag&sida=2"), noticeDetail)).toMatchObject({
      kind: "document",
      page: 2,
    });
    expect(targetFromParams(new URLSearchParams("flik=fraga"), noticeDetail)).toBeNull();
  });

  it("find the citations of the fit assessment too", () => {
    const reason = matchView.assessment.reasons[1]!.citation!;
    const target = targetFromParams(new URLSearchParams(`citat=${reason.quote}&sida=4`), { ...noticeDetail, match: matchView });
    expect(target).toMatchObject({ citation: reason });
    expect(primaryDocumentId(noticeDetail)).toBe(DOCUMENT_ID);
  });
});
