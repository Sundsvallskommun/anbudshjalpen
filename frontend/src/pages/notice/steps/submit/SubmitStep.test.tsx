import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDetail } from "../../../../api/types";
import { companyUser, config, NOTICE_ID, noticeDetail, reviewView } from "../../../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../../../test/render";

function noticeWith(changes: Partial<NoticeDetail> = {}): MockRoute {
  return { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, ...changes } };
}

const reviewRoute: MockRoute = { method: "POST", path: `/api/notices/${NOTICE_ID}/review`, body: reviewView };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("Step 4 Lämna in", () => {
  it("lists every skall- and kvalificeringskrav and attachment to tick off, with the progress", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith()]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    const requirements = await screen.findByRole("group", { name: "Skall- och kvalificeringskrav" });
    expect(within(requirements).getByRole("checkbox", { name: "Ansvarsförsäkring om minst 5 miljoner kronor" })).not.toBeChecked();
    expect(within(requirements).getByRole("checkbox", { name: "Två referensuppdrag" })).toBeInTheDocument();
    const attachments = screen.getByRole("group", { name: "Bilagor att lämna med" });
    expect(within(attachments).getByRole("checkbox", { name: "Prisbilaga (bilaga 1)" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "0 av 3 klara" })).toBeInTheDocument();
  });

  it("ticks what the draft review found, flags what it did not, and keeps the ticks in this browser", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith(), reviewRoute]);
    const view = renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await screen.findByRole("heading", { level: 2, name: "Granska ditt anbudsutkast" });
    await userEvent.upload(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(["%PDF-1.7 utkast"], "utkast.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Granska utkastet" }));
    await screen.findByRole("heading", { level: 3, name: "1 sak behöver åtgärdas innan du lämnar anbudet" });
    await userEvent.click(screen.getByRole("tab", { name: "Lämna in" }));

    const requirements = screen.getByRole("group", { name: "Skall- och kvalificeringskrav" });
    const references = within(requirements).getByRole("checkbox", { name: "Två referensuppdrag" });
    expect(references).toBeChecked();
    expect(within(requirements).getByText("Granskat")).toBeInTheDocument();
    expect(within(requirements).getByText("Bevis saknas")).toBeInTheDocument();
    // The mark beside the text is said with the checkbox too.
    expect(references).toHaveAccessibleDescription("Granskningen: Granskat.");
    expect(within(requirements).getByRole("checkbox", { name: "Ansvarsförsäkring om minst 5 miljoner kronor" })).toHaveAccessibleDescription(
      "Bevis: Bifoga försäkringsbevis. Granskningen: Bevis saknas.",
    );
    expect(screen.getByRole("group", { name: "Bilagor att lämna med" })).toHaveTextContent("Hittades inte");
    expect(screen.getByRole("progressbar", { name: "1 av 3 klara" })).toBeInTheDocument();

    await userEvent.click(within(requirements).getByRole("checkbox", { name: "Ansvarsförsäkring om minst 5 miljoner kronor" }));
    expect(screen.getByRole("progressbar", { name: "2 av 3 klara" })).toBeInTheDocument();

    // A new visit without a review keeps the reader's own ticks.
    view.unmount();
    mockApi([...baseRoutes(companyUser), noticeWith()]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);
    expect(await screen.findByRole("progressbar", { name: "2 av 3 klara" })).toBeInTheDocument();
  });

  it("hands the tender in at the procurement in e-Avrop, by the deadline", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=fiktiv";
    mockApi([...baseRoutes(companyUser), noticeWith({ url: null, documents_url: eavrop })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    expect(await screen.findByRole("link", { name: "Gå till e-Avrop och lämna anbudet (öppnas i en ny flik)" })).toHaveAttribute("href", eavrop);
    expect(screen.getByText(/^Lämna anbudet i e-Avrop senast 26 oktober 2026 kl\. 23:59\./u)).toBeInTheDocument();
  });

  it("submits through e-Avrop itself when the notice only has a TED page, which takes no tenders", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ url: "https://ted.europa.eu/sv/notice/-/detail/1-2026", documents_url: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    expect(await screen.findByRole("link", { name: "Gå till e-Avrop (öppnas i en ny flik)" })).toHaveAttribute("href", config.eavrop_url);
  });

  it("says why a made-up notice without a page is not in e-Avrop", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ url: null, documents_url: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    expect(await screen.findByText(/Den här upphandlingen är påhittad och finns inte i e-Avrop/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gå till e-Avrop (öppnas i en ny flik)" })).toHaveAttribute("href", config.eavrop_url);
  });
});
