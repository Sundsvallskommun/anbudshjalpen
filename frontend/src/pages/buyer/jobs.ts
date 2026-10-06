/**
 * The Drift page's rules (direction.md, section 4 "Inköp: Företagens frågor och Drift"): the jobs grouped as Hämta,
 * Bearbeta and Skicka, each run's state in words, one line of its statistics, and when it ran. Pure functions, so the
 * rules are tested without rendering.
 */
import type { JobName, JobRunView } from "../../api/types";
import { calendarDaysUntil, formatNumber, formatShortDate } from "../../lib/format";

export interface JobGroup {
  title: string;
  description: string;
  jobs: readonly JobName[];
}

export const JOB_GROUPS: readonly JobGroup[] = [
  {
    title: "Hämta",
    description: "Annonser och lagtext från öppna källor.",
    jobs: ["ingest_ted", "ingest_eavrop", "ingest_lou"],
  },
  {
    title: "Bearbeta",
    description: "Stänger passerade annonser, tolkar underlag och bedömer vad som passar företagen.",
    jobs: ["close_expired", "interpret_pending", "match_all"],
  },
  {
    title: "Skicka",
    description: "Mejl till företagen.",
    jobs: ["send_reminders", "notify_matches"],
  },
];

/**
 * A run's state: done, failed, still running, never run, or (e-Avrop) not activated, because its robots.txt forbids
 * automatic fetching until the municipality has permission (docs/data-sources.md).
 */
export type RunState = "ok" | "failed" | "running" | "never" | "inactive";

export const RUN_STATE: Record<RunState, { label: string; dot: "success" | "error" | "accent" | "neutral" }> = {
  ok: { label: "Klar", dot: "success" },
  failed: { label: "Misslyckades", dot: "error" },
  running: { label: "Pågår", dot: "accent" },
  never: { label: "Inte körd", dot: "neutral" },
  inactive: { label: "Inte aktiverad – väntar på tillstånd", dot: "neutral" },
};

/** A run still marked as running after this long belongs to a process that died (services/jobs.STALE_AFTER). */
const STALE_MS = 2 * 60 * 60 * 1000;
const FAILED = new Set(["failed", "error"]);

function count(stats: Record<string, unknown>, key: string): number {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** What a job's latest run says. A run left behind as running by a process that died counts as failed. */
export function runState(job: JobName, run: JobRunView | undefined, now: number = Date.now()): RunState {
  if (!run) return "never";
  if (run.status === "running") return now - Date.parse(run.started_at) < STALE_MS ? "running" : "failed";
  if (FAILED.has(run.status)) return "failed";
  if (job === "ingest_eavrop" && count(run.stats, "blocked") > 0 && count(run.stats, "fetched") === 0) {
    return "inactive";
  }
  return "ok";
}

/** The words for each statistic the jobs report, in the order they are shown. */
const STAT_WORDS: readonly [key: string, words: string][] = [
  ["fetched", "hämtade"],
  ["inserted", "nya"],
  ["updated", "uppdaterade"],
  ["unchanged", "oförändrade"],
  ["deleted", "borttagna"],
  ["closed", "stängda"],
  ["interpreted", "tolkade"],
  ["companies", "företag"],
  ["assessed", "bedömda"],
  ["removed", "borttagna"],
  ["sent", "skickade"],
  ["rescheduled", "flyttade"],
  ["loaded", "inlästa"],
  ["skipped", "hoppades över"],
  ["blocked", "stoppade av robots.txt"],
  ["gave_up", "gav upp"],
  ["failed", "misslyckades"],
];

/**
 * One line of a run's statistics, "120 hämtade · 4 nya · 2 uppdaterade", from the numbers that are not zero; "Inget
 * nytt" when all are. Keys the app does not know are left out rather than shown raw.
 */
export function statsLine(stats: Record<string, unknown>): string {
  const parts = STAT_WORDS.filter(([key]) => count(stats, key) > 0).map(
    ([key, words]) => `${formatNumber(count(stats, key))} ${words}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "Inget nytt";
}

const clockFormat = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Stockholm",
});

/** When something happened, in relative words: "nyss", "för 5 minuter sedan", "i går kl. 03:00", "28 sep kl. 05:00". */
export function sinceText(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "nyss";
  if (minutes < 60) return `för ${minutes} ${minutes === 1 ? "minut" : "minuter"} sedan`;
  const clock = `kl. ${clockFormat.format(new Date(iso))}`;
  const days = calendarDaysUntil(iso, now);
  if (days === 0) return `i dag ${clock}`;
  if (days === -1) return `i går ${clock}`;
  return `${formatShortDate(iso, "auto", now)} ${clock}`;
}

/** A group's jobs with the failed ones first (direction.md: "Misslyckade jobb visas först"), else in their order. */
export function failedFirst(
  jobs: readonly JobName[],
  latest: (job: JobName) => JobRunView | undefined,
  now: number = Date.now(),
): JobName[] {
  const failed = jobs.filter((job) => runState(job, latest(job), now) === "failed");
  return [...failed, ...jobs.filter((job) => !failed.includes(job))];
}
