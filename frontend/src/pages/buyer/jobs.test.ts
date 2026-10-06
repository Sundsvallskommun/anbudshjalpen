import { describe, expect, it } from "vitest";
import type { JobName, JobRunView } from "../../api/types";
import { formatNumber } from "../../lib/format";
import { failedFirst, JOB_GROUPS, runState, sinceText, statsLine } from "./jobs";

const NOW = new Date("2026-10-05T12:00:00Z");

function run(job: string, status: string, startedAt = "2026-10-05T11:00:00Z", stats: Record<string, unknown> = {}): JobRunView {
  return { id: `${job}-${startedAt}`, job, status, started_at: startedAt, finished_at: startedAt, stats, error: null };
}

describe("JOB_GROUPS", () => {
  it("groups every job once as Hämta, Bearbeta and Skicka", () => {
    expect(JOB_GROUPS.map((group) => group.title)).toEqual(["Hämta", "Bearbeta", "Skicka"]);
    const jobs = JOB_GROUPS.flatMap((group) => group.jobs);
    expect(new Set(jobs).size).toBe(8);
  });
});

describe("runState", () => {
  it("reads the latest run", () => {
    expect(runState("ingest_ted", undefined)).toBe("never");
    expect(runState("ingest_ted", run("ingest_ted", "ok"))).toBe("ok");
    expect(runState("ingest_ted", run("ingest_ted", "failed"))).toBe("failed");
    expect(runState("ingest_ted", run("ingest_ted", "running", "2026-10-05T11:59:00Z"), NOW.getTime())).toBe("running");
  });

  it("counts a run left behind by a process that died as failed", () => {
    expect(runState("ingest_ted", run("ingest_ted", "running", "2026-10-05T08:00:00Z"), NOW.getTime())).toBe("failed");
  });

  it("calls e-Avrop not activated while its robots.txt stops every fetch", () => {
    const blocked = run("ingest_eavrop", "ok", "2026-10-05T04:30:00Z", { fetched: 0, inserted: 0, updated: 0, blocked: 2 });
    expect(runState("ingest_eavrop", blocked)).toBe("inactive");
    const fetched = run("ingest_eavrop", "ok", "2026-10-05T04:30:00Z", { fetched: 12, blocked: 1 });
    expect(runState("ingest_eavrop", fetched)).toBe("ok");
  });
});

describe("statsLine", () => {
  it("names the numbers that are not zero, in a fixed order, and skips unknown keys", () => {
    expect(statsLine({ updated: 2, fetched: 1200, inserted: 4, deleted: 0, mystery: 9 })).toBe(
      `${formatNumber(1200)} hämtade · 4 nya · 2 uppdaterade`,
    );
    expect(statsLine({ sent: 0, failed: 0 })).toBe("Inget nytt");
    expect(statsLine({ interpreted: 1, gave_up: 1 })).toBe("1 tolkade · 1 gav upp");
  });
});

describe("sinceText", () => {
  it("says how long ago in words", () => {
    expect(sinceText("2026-10-05T11:59:40Z", NOW)).toBe("nyss");
    expect(sinceText("2026-10-05T11:59:00Z", NOW)).toBe("för 1 minut sedan");
    expect(sinceText("2026-10-05T11:15:00Z", NOW)).toBe("för 45 minuter sedan");
    expect(sinceText("2026-10-05T06:00:00Z", NOW)).toBe("i dag kl. 08:00");
    expect(sinceText("2026-10-04T01:00:00Z", NOW)).toBe("i går kl. 03:00");
    expect(sinceText("2026-09-28T03:00:00Z", NOW)).toBe("28 sep kl. 05:00");
  });
});

describe("failedFirst", () => {
  it("lifts failed jobs to the top of their group and keeps the rest in order", () => {
    const runs: Partial<Record<JobName, JobRunView>> = {
      ingest_lou: run("ingest_lou", "failed"),
      ingest_ted: run("ingest_ted", "ok"),
    };
    expect(failedFirst(["ingest_ted", "ingest_eavrop", "ingest_lou"], (job) => runs[job])).toEqual([
      "ingest_lou",
      "ingest_ted",
      "ingest_eavrop",
    ]);
  });
});
