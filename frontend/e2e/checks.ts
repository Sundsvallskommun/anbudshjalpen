/**
 * The gate's measurements. Each returns data; the spec decides what fails.
 * Adapted from Tal till text's accessibility gate (tests/e2e/checks.ts).
 */
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Waits for running animations (a dialog opening) so colours are measured at rest. */
export async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]),
  );
}

export async function axe(page: Page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return {
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      tags: violation.tags,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
    incomplete: result.incomplete.map((item) => ({ id: item.id, help: item.help, nodes: item.nodes.length })),
  };
}

/** What fails the gate: every WCAG violation whatever its impact, and best practice when serious or critical. */
export function blocking<T extends { impact: string | null; tags: string[] }>(violations: T[]): T[] {
  return violations.filter(
    (violation) =>
      violation.tags.some((tag) => /^wcag\d/.test(tag)) || violation.impact === "serious" || violation.impact === "critical",
  );
}

/** WCAG 1.4.10: nothing may make the page scroll sideways at 320 px or 200 % zoom. */
export function horizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/** Exactly one h1 per page, so a screen reader's heading list starts at the page's subject. */
export function headingOneCount(page: Page) {
  return page.locator("h1").count();
}

/** Logs in as a demo persona with the browser context's cookie jar, as the login page would. */
export async function loginAs(request: APIRequestContext, baseURL: string, persona: "foretagare" | "inkopare") {
  const response = await request.post("/api/session/login", { data: { persona }, headers: { Origin: baseURL } });
  if (!response.ok()) throw new Error(`Inloggningen som ${persona} misslyckades: ${response.status()}`);
}

/** The page has its heading and nothing is loading any more. */
export async function ready(page: Page) {
  await page.locator("h1").first().waitFor();
  await page.waitForFunction(() => !document.querySelector('[role="status"] .astryx-spinner, [aria-busy="true"]'));
}
