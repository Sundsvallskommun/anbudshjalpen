import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKLIST_ID,
  DOCUMENT_ID,
  NOTICE_ID,
  checklistView,
  draftChecklistView,
  matchView,
  noticeBuyers,
  noticeList,
  pageFour,
  rejectedChecklistView,
} from "../test/fixtures";
import { mockApi } from "../test/render";
import {
  keys,
  useMatches,
  useNoticeBuyers,
  useNotices,
  usePage,
  usePages,
  useReopenChecklist,
  useRestoreMatch,
  useUpdateProfile,
  type NoticeFilters,
} from "./queries";
import type { CompanyUpdate, CompanyView, ProfileSaved } from "./types";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useNotices", () => {
  it("asks for an order only when one is chosen, and returns the counts per status", async () => {
    const calls = mockApi([{ method: "GET", path: "/api/notices", body: noticeList }]);
    const { wrapper } = setup();

    const { result } = renderHook(() => useNotices({ status: "open", sort: "deadline", limit: 20, offset: 0 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URLSearchParams(calls[0]!.search).get("sort")).toBe("deadline");
    expect(result.current.data?.counts).toEqual({ open: 1, planned: 0, all: 1 });
    expect(result.current.data?.sort).toBe("deadline");

    renderHook(() => useNotices({ status: "planned", limit: 20, offset: 0 }), { wrapper });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(new URLSearchParams(calls[1]!.search).has("sort")).toBe(false); // the backend picks the default
  });
});

describe("useReopenChecklist", () => {
  it("opens a rejected checklist as a draft and shows the draft at once", async () => {
    const reopened = { ...draftChecklistView, reviewer_note: rejectedChecklistView.reviewer_note };
    const calls = mockApi([{ method: "POST", path: `/api/admin/checklists/${CHECKLIST_ID}/reopen`, body: reopened }]);
    const { client, wrapper } = setup();
    client.setQueryData(keys.adminChecklist(CHECKLIST_ID), rejectedChecklistView);

    const { result } = renderHook(() => useReopenChecklist(CHECKLIST_ID), { wrapper });
    await act(() => result.current.mutateAsync());

    expect(calls.map((call) => `${call.method} ${call.path}`)).toContain(
      `POST /api/admin/checklists/${CHECKLIST_ID}/reopen`,
    );
    expect(client.getQueryData(keys.adminChecklist(CHECKLIST_ID))).toEqual(reopened);
    expect(reopened.status).toBe("draft");
    expect(checklistView.status).toBe("published"); // the companies' checklist is another record
  });

  it("passes on the backend's refusal for a checklist that is not rejected", async () => {
    mockApi([
      {
        method: "POST",
        path: `/api/admin/checklists/${CHECKLIST_ID}/reopen`,
        status: 409,
        body: { detail: "Bara en avvisad eller tillbakadragen checklista kan öppnas som utkast igen." },
      },
    ]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useReopenChecklist(CHECKLIST_ID), { wrapper });
    await expect(act(() => result.current.mutateAsync())).rejects.toMatchObject({
      status: 409,
      message: "Bara en avvisad eller tillbakadragen checklista kan öppnas som utkast igen.",
    });
  });
});

describe("useRestoreMatch", () => {
  it("undoes a dismissal and fetches the matches again", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/matches", body: [matchView] },
      { method: "POST", path: `/api/matches/${matchView.id}/restore`, status: 204 },
    ]);
    const { wrapper } = setup();
    const matches = renderHook(() => useMatches(), { wrapper });
    await waitFor(() => expect(matches.result.current.isSuccess).toBe(true));
    expect(matches.result.current.data?.[0]?.engine).toBe("heuristic");

    const { result } = renderHook(() => useRestoreMatch(), { wrapper });
    await act(() => result.current.mutateAsync(matchView.id));

    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/restore"))).toBe(true);
    await waitFor(() => expect(calls.filter((call) => call.path === "/api/matches")).toHaveLength(2));
  });
});

describe("useNoticeBuyers", () => {
  it("counts the buyers with the list's filters, and paging or the chosen buyer do not refetch them", async () => {
    const calls = mockApi([{ method: "GET", path: "/api/notices/buyers", body: noticeBuyers }]);
    const { wrapper } = setup();
    const listFilters: NoticeFilters = { q: "städ", status: "open", cpv: "9091", limit: 20, offset: 0 };

    const { result, rerender } = renderHook((filters: NoticeFilters) => useNoticeBuyers(filters), {
      wrapper,
      initialProps: listFilters,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items[0]).toEqual({ name: "Sundsvalls kommun", count: 12 });
    const sent = new URLSearchParams(calls[0]!.search);
    expect(Object.fromEntries(sent)).toEqual({ q: "städ", status: "open", cpv: "9091" });

    rerender({ ...listFilters, offset: 20, buyer: "Timrå kommun", sort: "published" });
    await act(async () => {});
    expect(calls).toHaveLength(1);

    rerender({ ...listFilters, status: "planned" });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(new URLSearchParams(calls[1]!.search).get("status")).toBe("planned");
  });

  it("is refetched with the lists, which share its key prefix", async () => {
    const calls = mockApi([{ method: "GET", path: "/api/notices/buyers", body: noticeBuyers }]);
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useNoticeBuyers({}), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(() => client.invalidateQueries({ queryKey: ["notices"] }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });
});

describe("useNotices with a buyer", () => {
  it("sends the buyer filter", async () => {
    const calls = mockApi([{ method: "GET", path: "/api/notices", body: noticeList }]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useNotices({ buyer: "Sundsvalls kommun", limit: 20, offset: 0 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(new URLSearchParams(calls[0]!.search).get("buyer")).toBe("Sundsvalls kommun");
    expect(result.current.data?.items[0]?.reference_number).toBe("DEMO-2026-0147");
  });
});

describe("usePages", () => {
  const base = `/api/notices/${NOTICE_ID}/documents/${DOCUMENT_ID}/pages`;

  it("fetches every page once, in the order asked for, sharing the cache with usePage", async () => {
    const pageSeven = { ...pageFour, page_no: 7, text: "3.4 Ansvarsförsäkring" };
    const calls = mockApi([
      { method: "GET", path: `${base}/4`, body: pageFour },
      { method: "GET", path: `${base}/7`, body: pageSeven },
    ]);
    const { client, wrapper } = setup();

    const { result } = renderHook(() => usePages(NOTICE_ID, DOCUMENT_ID, [7, 4]), { wrapper });
    await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true));
    expect(result.current.map((query) => query.data?.page_no)).toEqual([7, 4]);
    expect(client.getQueryData(keys.page(NOTICE_ID, DOCUMENT_ID, 7))).toEqual(pageSeven);

    const single = renderHook(() => usePage(NOTICE_ID, DOCUMENT_ID, 4), { wrapper });
    expect(single.result.current.data).toEqual(pageFour); // from the cache, not a new request
    expect(calls).toHaveLength(2);
  });

  it("asks for nothing without pages", () => {
    const calls = mockApi([]);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePages(NOTICE_ID, DOCUMENT_ID, []), { wrapper });
    expect(result.current).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("useUpdateProfile", () => {
  const profile: CompanyView = {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    org_number: "559900-0013",
    name: "Målerifirman i Matfors AB",
    description: "Vi målar invändigt och utvändigt.",
    cpv_codes: ["45442100"],
    cpv_labels: { "45442100": "Målning" },
    municipalities: ["Sundsvall", "Timrå"],
    employees: 5,
    annual_turnover_sek: 4_800_000,
    certifications: [],
    insurance: "Ansvarsförsäkring 5 000 000 kronor",
    public_references: null,
    is_fictitious: true,
  };
  const update: CompanyUpdate = {
    description: profile.description,
    cpv_codes: profile.cpv_codes,
    municipalities: profile.municipalities,
    employees: profile.employees,
    annual_turnover_sek: profile.annual_turnover_sek,
    certifications: profile.certifications,
    insurance: profile.insurance,
    public_references: profile.public_references,
  };

  it("gives the count of fitting notices to the page, keeps the profile and refetches what the fit changes", async () => {
    const saved: ProfileSaved = { ...profile, fitting_notices: 2 };
    const calls = mockApi([
      { method: "PUT", path: "/api/profile", body: saved },
      { method: "GET", path: "/api/matches", body: [matchView] },
      { method: "GET", path: "/api/notices", body: noticeList },
    ]);
    const { client, wrapper } = setup();
    renderHook(() => useMatches(), { wrapper });
    renderHook(() => useNotices({ limit: 20, offset: 0 }), { wrapper });
    await waitFor(() => expect(calls).toHaveLength(2));

    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    const answer = await act(() => result.current.mutateAsync(update));

    expect(answer.fitting_notices).toBe(2);
    expect(client.getQueryData(keys.profile)).toEqual(profile); // the profile, without the count
    await waitFor(() => expect(calls.filter((call) => call.path === "/api/matches")).toHaveLength(2));
    await waitFor(() => expect(calls.filter((call) => call.path === "/api/notices")).toHaveLength(2));
  });

  it("passes on that the count is not known yet when the matches are assessed after the answer", async () => {
    mockApi([{ method: "PUT", path: "/api/profile", body: { ...profile, fitting_notices: null } }]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    const answer = await act(() => result.current.mutateAsync(update));
    expect(answer.fitting_notices).toBeNull();
  });
});
