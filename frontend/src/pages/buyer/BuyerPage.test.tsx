import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasActiveRun, JOB_POLL_MS } from "../../api/queries";
import type { InterpretationView, JobRunView } from "../../api/types";
import { buyerUser } from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../../test/render";

function run(job: string, startedAt: string, status = "ok"): JobRunView {
  return {
    id: `${job}-${startedAt}`,
    job,
    status,
    started_at: startedAt,
    finished_at: status === "running" ? null : startedAt,
    stats: {},
    error: null,
  };
}

// The backend lists the latest run of every job that has run, newest first.
const recent = [
  run("send_reminders", "2026-10-05T11:44:56Z"),
  run("interpret_pending", "2026-10-05T11:40:00Z"),
  run("notify_matches", "2026-10-05T11:30:00Z"),
  run("match_all", "2026-10-05T11:08:56Z"),
  run("ingest_lou", "2026-09-28T03:00:00Z", "failed"),
];

afterEach(() => {
  vi.useRealTimers();
});

describe("BuyerPage jobs", () => {
  it("shows the latest run of a weekly job, and says when a job has never run", async () => {
    mockApi([...baseRoutes(buyerUser), { method: "GET", path: "/api/admin/jobs", body: recent }]);
    renderApp("/inkop?flik=jobb");

    const lou = (await screen.findByRole("heading", { level: 3, name: "Uppdatera LOU" })).closest("li")!;
    expect(await within(lou).findByText("Senast 28 september 2026 kl. 05:00: misslyckades.")).toBeInTheDocument();
    const ted = screen.getByRole("heading", { level: 3, name: "Hämta annonser från TED" }).closest("li")!;
    expect(within(ted).getByText("Har inte körts ännu.")).toBeInTheDocument();
    // The visible words start the accessible name, and acronyms keep their case.
    expect(within(lou).getByRole("button", { name: "Kör nu: Uppdatera LOU" })).toHaveTextContent("Kör nu");
    expect(screen.getByRole("button", { name: "Kör nu: Stäng passerade annonser" })).toBeInTheDocument();
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
          runs = [started, ...recent];
          return started;
        },
      },
    ]);
    renderApp("/inkop?flik=jobb");

    await user.click(await screen.findByRole("button", { name: "Kör nu: Uppdatera LOU" }));
    const lou = screen.getByRole("heading", { level: 3, name: "Uppdatera LOU" }).closest("li")!;
    expect(await within(lou).findByText("Senast 5 oktober 2026 kl. 13:50: pågår.")).toBeInTheDocument();

    runs = [{ ...started, status: "ok", finished_at: "2026-10-05T11:50:02Z" }, ...recent];
    const fetches = calls.filter((call) => call.path === "/api/admin/jobs").length;
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
    expect(await within(lou).findByText("Senast 5 oktober 2026 kl. 13:50: klar.")).toBeInTheDocument();
    expect(calls.filter((call) => call.path === "/api/admin/jobs").length).toBeGreaterThan(fetches);
  });
});

const failed: InterpretationView = {
  document_id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
  notice_id: "6f1c2a52-0a43-4c47-9d7e-1f3f0c6b9a01",
  notice_title: "Ommålning av Solbackens förskola, Matfors",
  filename: "Förfrågningsunderlag.pdf",
  state: "failed",
  attempts: 5,
  error: "Underlaget är för stort för språkmodellen i Eneo. Prova en modell med större kontext.",
  retry_at: null,
  created_at: "2026-10-05T08:00:00Z",
};

describe("BuyerPage interpretations", () => {
  it("lists a document the worker gave up on and interprets it again", async () => {
    const calls = mockApi([
      ...baseRoutes(buyerUser),
      { method: "GET", path: "/api/admin/checklists", body: [] },
      { method: "GET", path: "/api/admin/interpretations", body: [failed] },
      {
        method: "POST",
        path: `/api/admin/documents/${failed.document_id}/interpret`,
        status: 202,
        body: { ...failed, state: "pending", attempts: 0, error: null },
      },
    ]);
    renderApp("/inkop");

    const section = await screen.findByRole("region", { name: "Underlag utan checklista" });
    expect(within(section).getByText("Tolkningen gav upp")).toBeInTheDocument();
    expect(within(section).getByText(`Senaste fel: ${failed.error}`)).toBeInTheDocument();
    await userEvent.click(within(section).getByRole("button", { name: "Tolka igen: Förfrågningsunderlag.pdf" }));

    expect(await within(section).findByText(/Tolkningen har startat/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/interpret"))).toBe(true);
  });

  it("shows nothing extra when every document has a checklist", async () => {
    mockApi([
      ...baseRoutes(buyerUser),
      { method: "GET", path: "/api/admin/checklists", body: [] },
      { method: "GET", path: "/api/admin/interpretations", body: [] },
    ]);
    renderApp("/inkop");

    expect(await screen.findByText("Alla checklistor är granskade.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Underlag utan checklista" })).not.toBeInTheDocument();
  });

  it("offers today's procedure names only", async () => {
    mockApi([...baseRoutes(buyerUser)]);
    renderApp("/inkop?flik=ny");

    await userEvent.click(await screen.findByRole("combobox", { name: /Förfarande/ }));
    expect(await screen.findByRole("option", { name: "Öppet förfarande" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Annonserad upphandling under tröskelvärdena (19 kap. LOU)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Förenklat förfarande|Urvalsförfarande/ })).not.toBeInTheDocument();
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
