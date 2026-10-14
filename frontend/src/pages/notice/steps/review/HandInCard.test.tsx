import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDetail } from "../../../../api/types";
import { companyUser, config, NOTICE_ID, noticeDetail } from "../../../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../../../test/render";

function noticeWith(changes: Partial<NoticeDetail> = {}): MockRoute {
  return { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: { ...noticeDetail, ...changes } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Lämna anbudet, at the end of Granska", () => {
  it("hands the tender in at the procurement in e-Avrop, by the deadline, before any review", async () => {
    const eavrop = "https://www.e-avrop.com/sundsvall/e-Upphandling/Default.aspx?id=fiktiv";
    mockApi([...baseRoutes(companyUser), noticeWith({ url: null, documents_url: eavrop })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    expect(await screen.findByRole("heading", { level: 2, name: "Lämna anbudet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gå till e-Avrop och lämna anbudet (öppnas i en ny flik)" })).toHaveAttribute("href", eavrop);
    expect(screen.getByText(/^Lämna anbudet i e-Avrop senast 26 oktober 2026 kl\. 23:59\./u)).toBeInTheDocument();
  });

  it("submits through e-Avrop itself when the notice only has a TED page, which takes no tenders", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ url: "https://ted.europa.eu/sv/notice/-/detail/1-2026", documents_url: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    expect(await screen.findByRole("link", { name: "Gå till e-Avrop (öppnas i en ny flik)" })).toHaveAttribute("href", config.eavrop_url);
  });

  it("says why a made-up notice without a page is not in e-Avrop", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith({ url: null, documents_url: null })]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    expect(await screen.findByText(/Den här upphandlingen är påhittad och finns inte i e-Avrop/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gå till e-Avrop (öppnas i en ny flik)" })).toHaveAttribute("href", config.eavrop_url);
  });

  it("opens Granska from the address of the old step Lämna in", async () => {
    mockApi([...baseRoutes(companyUser), noticeWith()]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=inlamning`);

    expect(await screen.findByRole("tab", { name: "Granska" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "Lämna anbudet" })).toBeInTheDocument();
  });
});
