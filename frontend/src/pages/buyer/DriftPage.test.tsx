import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasActiveRun, JOB_POLL_MS } from "../../api/queries";
import type { JobRunView } from "../../api/types";
import { buyerUser } from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../../test/render";

function run(job: string, startedAt: string, status = "ok", stats: Record<string, unknown> = {}): JobRunView {
  return {
    id: `${job}-${startedAt}`,
    job,
    status,
    started_at: startedAt,
    finished_at: status === "running" ? null : startedAt,
    stats,
    error: status === "failed" ? "LOU-texten kunde inte hämtas från Riksdagen." : null,
  };
}

// The backend lists the latest run of every job that has run, newest first.
const recent = [
  run("send_reminders", "2026-10-05T11:44:56Z", "ok", { sent: 2, failed: 0 }),
  run("interpret_pending", "2026-10-05T11:40:00Z"),
  run("match_all", "2026-10-05T11:08:56Z", "ok", { companies: 3, assessed: 12 }),
  run("ingest_eavrop", "2026-10-05T04:30:00Z", "ok", { fetched: 0, inserted: 0, updated: 0, not_configured: 1 }),
  run("ingest_lou", "2026-09-28T03:00:00Z", "failed"),
];

afterEach(() => {
  vi.useRealTimers();
});

function group(name: string) {
  return screen.getByRole("list", { name });
}

describe("DriftPage", () => {
  it("groups the jobs, puts failed ones first and says how each latest run went", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    mockApi([...baseRoutes(buyerUser), { method: "GET", path: "/api/admin/jobs", body: recent }]);
    renderApp("/inkop/drift");

    expect(await screen.findByRole("heading", { level: 1, name: "Drift" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Hämta",
      "Bearbeta",
      "Skicka",
    ]);

    const fetching = within(await screen.findByRole("list", { name: "Hämta" })).getAllByRole("listitem");
    expect(within(fetching[0]!).getByRole("heading", { name: "Uppdatera LOU" })).toBeInTheDocument();
    expect(within(fetching[0]!).getByText("Misslyckades")).toBeInTheDocument();
    expect(within(fetching[0]!).getByText("Fel: LOU-texten kunde inte hämtas från Riksdagen.")).toBeInTheDocument();
    expect(within(fetching[1]!).getByText("Inte körd")).toBeInTheDocument();
    expect(within(fetching[2]!).getByText("Inte aktiverad – nyckel saknas")).toBeInTheDocument();

    // The state, when the run was and what it did are one line: "Klar · Senast för 15 minuter sedan · 2 skickade".
    const sending = within(group("Skicka")).getAllByRole("listitem");
    expect(within(sending[0]!).getByText("Klar")).toBeInTheDocument();
    expect(within(sending[0]!).getByText("· Senast för 15 minuter sedan · 2 skickade")).toBeInTheDocument();
    expect(within(group("Bearbeta")).getByRole("button", { name: "Kör nu: Stäng passerade annonser" })).toHaveTextContent(
      "Kör nu",
    );
  });

  it("follows a started job until it has finished", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-05T11:50:00Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const started = run("ingest_lou", "2026-10-05T11:50:00Z", "running");
    let runs = recent;
    const calls = mockApi([
      ...baseRoutes(buyerUser),
      { method: "GET", path: "/api/admin/jobs", body: () => runs },
      {
        method: "POST",
        path: "/api/admin/jobs/ingest_lou/run",
        body: () => {
          runs = [started, ...recent.filter((item) => item.job !== "ingest_lou")];
          return started;
        },
      },
    ]);
    renderApp("/inkop/drift");

    await user.click(await screen.findByRole("button", { name: "Kör nu: Uppdatera LOU" }));
    expect(await screen.findByText("Pågår")).toBeInTheDocument();

    runs = [{ ...started, status: "ok", finished_at: "2026-10-05T11:50:02Z", stats: { fetched: 422, unchanged: 422 } }, ...recent.slice(0, 4)];
    const fetches = calls.filter((call) => call.path === "/api/admin/jobs").length;
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
    expect(await screen.findByText("· Senast nyss · 422 hämtade · 422 oförändrade")).toBeInTheDocument();
    expect(calls.filter((call) => call.path === "/api/admin/jobs").length).toBeGreaterThan(fetches);
  });
});

describe("hasActiveRun", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");

  it("polls for a run in progress but not for one left behind by a process that died", () => {
    expect(hasActiveRun([run("ingest_ted", "2026-10-05T11:59:00Z", "running")], now)).toBe(true);
    expect(hasActiveRun([run("ingest_ted", "2026-10-05T09:00:00Z", "running")], now)).toBe(false);
    expect(hasActiveRun(recent, now)).toBe(false);
    expect(hasActiveRun(undefined, now)).toBe(false);
  });
});
