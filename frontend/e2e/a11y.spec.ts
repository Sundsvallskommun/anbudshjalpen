/**
 * Every state of the demo journey at every project's width and colour mode: axe (no WCAG violation at
 * any impact, no serious or critical best practice; what axe cannot decide is listed as a manual check),
 * one h1 per page, no sideways scrolling at 320 px and 200 % zoom (WCAG 1.4.10), and no Content Security
 * Policy violation or uncaught error (the backend serves the app with `script-src 'self'; style-src 'self'`).
 *
 * The app must be running with the demo data (`anbudsklar seed`). States that need data the database
 * does not have are skipped with the reason, never passed silently.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { axe, blocking, headingOneCount, horizontalScroll, loginAs, ready } from "./checks";

type Persona = "foretagare" | "inkopare" | null;

interface State {
  name: string;
  persona: Persona;
  /** Brings the page into the state; returns a reason to skip when the data for it is missing. */
  go: (page: Page) => Promise<string | void>;
}

async function openFirstNotice(page: Page, withChecklist: boolean): Promise<string | void> {
  await page.goto("/");
  await ready(page);
  const rows = page.getByRole("list", { name: "Upphandlingar" }).getByRole("listitem");
  const candidates = withChecklist ? rows.filter({ hasText: "Checklista finns" }) : rows;
  if ((await candidates.count()) === 0) return withChecklist ? "ingen upphandling med publicerad checklista" : "inga upphandlingar";
  await candidates.first().getByRole("link").first().click();
  await page.waitForURL(/\/upphandlingar\//);
  // React keeps the old page on screen until the new one has loaded.
  await expect(page.locator("h1")).not.toHaveText("Upphandlingar");
  await ready(page);
}

async function openTab(page: Page, tab: string) {
  await page.getByRole("tab", { name: tab }).click();
  await ready(page);
}

const STATES: State[] = [
  { name: "upphandlingar", persona: null, go: async (page) => page.goto("/").then(() => ready(page)) },
  { name: "logga-in", persona: null, go: async (page) => page.goto("/logga-in").then(() => ready(page)) },
  { name: "regelhjalpen", persona: null, go: async (page) => page.goto("/regelhjalpen").then(() => ready(page)) },
  { name: "upphandling-checklista", persona: null, go: (page) => openFirstNotice(page, true) },
  {
    name: "upphandling-kalla",
    persona: null,
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await page.getByRole("button", { name: /^Sida \d+, .*Visa källan$/ }).first().click();
      await page.getByRole("dialog", { name: "Källan i underlaget" }).waitFor();
      await ready(page);
    },
  },
  {
    name: "upphandling-fraga",
    persona: null,
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await openTab(page, "Fråga underlaget");
    },
  },
  { name: "bevakning", persona: "foretagare", go: async (page) => page.goto("/bevakning").then(() => ready(page)) },
  { name: "profil", persona: "foretagare", go: async (page) => page.goto("/profil").then(() => ready(page)) },
  { name: "paminnelser", persona: "foretagare", go: async (page) => page.goto("/paminnelser").then(() => ready(page)) },
  {
    name: "upphandling-granska",
    persona: "foretagare",
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await openTab(page, "Granska utkast");
    },
  },
  {
    name: "upphandling-inlamning",
    persona: "foretagare",
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await openTab(page, "Inför inlämning");
    },
  },
  { name: "inkop-ko", persona: "inkopare", go: async (page) => page.goto("/inkop").then(() => ready(page)) },
  { name: "inkop-ny", persona: "inkopare", go: async (page) => page.goto("/inkop?flik=ny").then(() => ready(page)) },
  { name: "inkop-insikter", persona: "inkopare", go: async (page) => page.goto("/inkop?flik=insikter").then(() => ready(page)) },
  { name: "inkop-jobb", persona: "inkopare", go: async (page) => page.goto("/inkop?flik=jobb").then(() => ready(page)) },
  {
    name: "inkop-granska-checklista",
    persona: "inkopare",
    go: async (page) => {
      await page.goto("/inkop?flik=granska");
      await ready(page);
      const links = page.getByRole("list", { name: "Checklistor" }).getByRole("link");
      if ((await links.count()) === 0) return "inga checklistor att granska";
      await links.first().click();
      await page.waitForURL(/\/inkop\/checklistor\//);
      await expect(page.locator("h1")).toHaveText("Granska checklistan");
      await ready(page);
    },
  },
];

function narrow(info: TestInfo) {
  return info.project.name.startsWith("phone-320") || info.project.name === "zoom-200";
}

for (const state of STATES) {
  test(state.name, async ({ page, baseURL }, info) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    if (state.persona) await loginAs(page.request, baseURL ?? "", state.persona);
    const skip = await state.go(page);
    test.skip(Boolean(skip), String(skip));

    const scan = await axe(page);
    const headings = await headingOneCount(page);
    const scrolls = narrow(info) ? await horizontalScroll(page) : false;
    writeFileSync(
      info.outputPath("findings.json"),
      JSON.stringify({ state: state.name, axe: scan, headings, scrolls, errors }, null, 2),
    );

    for (const item of scan.incomplete) {
      info.annotations.push({ type: "manual check", description: `${item.id}: ${item.help} (${item.nodes} element(s))` });
    }
    expect
      .soft(
        blocking(scan.violations).map((violation) => `${violation.id} (${violation.impact}): ${violation.help} → ${violation.targets.join(", ")}`),
        "axe: WCAG violations, and serious or critical best practice",
      )
      .toEqual([]);
    expect.soft(headings, "exactly one h1").toBe(1);
    expect.soft(scrolls, "horizontal scroll (WCAG 1.4.10)").toBe(false);
    expect.soft(errors, "CSP violations and uncaught errors").toEqual([]);
  });
}
