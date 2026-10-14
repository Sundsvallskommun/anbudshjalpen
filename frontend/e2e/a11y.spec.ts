/**
 * Every state of the demo journey at every project's width and colour mode: axe (no WCAG violation at
 * any impact, no serious or critical best practice; what axe cannot decide is listed as a manual check),
 * one h1 per page, no sideways scrolling at 320 px and 200 % zoom (WCAG 1.4.10), and no Content Security
 * Policy violation or uncaught error (the backend serves the app with `script-src 'self'; style-src 'self'`).
 *
 * The phone projects cover the phone's frame in every state: the two-row header (the main choices as tabs on a
 * top-level page, the back link on a detail page), the step bar's short labels, and the source in a bottom sheet
 * instead of a dialog. The overlays the frame opens (the demo strip's "Om demon och AI", the account menu) have
 * states of their own.
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
  /** The state is "Fråga AI" opening by itself with its welcome; every other state is a returning reader's. */
  isWelcome?: boolean;
}

/** components/ask/askAiState: who "Fråga AI" has welcomed in this browser, so it does not open by itself again. */
const WELCOMED_KEY = "anbudsklar.fraga-ai.valkomnad.v1";

/** Makes the browser a returning reader's: the visitor and the logged-in user have had the welcome. */
async function asReturningReader(page: Page, baseURL: string) {
  const response = await page.request.get(`${baseURL}/api/session`);
  const session = (await response.json()) as { user: { id: string } | null };
  const welcomed = JSON.stringify(["besokare", ...(session.user ? [session.user.id] : [])]);
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [WELCOMED_KEY, welcomed] as const);
}

/** The token on a notice whose checklist inköp has reviewed and published (lib/labels PUBLISHED_CHECKLIST). */
const PUBLISHED_CHECKLIST = "Granskad checklista";

async function open(page: Page, path: string) {
  await page.goto(path);
  await ready(page);
}

async function openFirstNotice(page: Page, withChecklist: boolean): Promise<string | void> {
  await open(page, "/upphandlingar");
  const rows = page.getByRole("list", { name: "Upphandlingar" }).getByRole("listitem");
  const candidates = withChecklist ? rows.filter({ hasText: PUBLISHED_CHECKLIST }) : rows;
  if ((await candidates.count()) === 0) return withChecklist ? "ingen upphandling med granskad checklista" : "inga upphandlingar";
  await candidates.first().getByRole("link").first().click();
  await page.waitForURL(/\/upphandlingar\/[^/?#]+/);
  // React keeps the old page on screen until the new one has loaded.
  await expect(page.locator("h1")).not.toHaveText("Upphandlingar");
  await ready(page);
}

/** One of the notice page's three steps: Krav, Granska or Lämna in (a step's mark adds words to its name). */
async function openStep(page: Page, step: "Krav" | "Granska" | "Lämna in") {
  await page.getByRole("tablist", { name: "Steg" }).getByRole("tab", { name: step }).click();
  await ready(page);
}

const STATES: State[] = [
  { name: "upphandlingar", persona: null, go: (page) => open(page, "/upphandlingar") },
  { name: "logga-in", persona: null, go: (page) => open(page, "/logga-in") },
  { name: "regelhjalpen", persona: null, go: (page) => open(page, "/regelhjalpen") },
  {
    name: "om-demon",
    persona: null,
    go: async (page) => {
      await open(page, "/upphandlingar");
      // The demo strip's link: "Om demon och AI", or "Mer" named "Mer om demon och AI" on a phone.
      await page.getByRole("banner").getByRole("button", { name: /om demon och AI$/i }).click();
      await page.getByRole("dialog", { name: "Om demon och AI" }).waitFor();
      await ready(page);
    },
  },
  { name: "upphandling-checklista", persona: null, go: (page) => openFirstNotice(page, true) },
  {
    name: "upphandling-kalla",
    persona: null,
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      // Every "s. N" is a link named by what it backs ("Visa källan för ”…”, s. 4"); a phone opens a bottom sheet.
      await page.getByRole("link", { name: /^Visa källan/ }).first().click();
      await page.getByRole("dialog", { name: "Källan i underlaget" }).waitFor();
      await ready(page);
    },
  },
  {
    name: "upphandling-fraga",
    persona: null,
    go: async (page) => {
      // The "Fråga AI" panel (decision 0014), which replaced step 2: a dialog, or a bottom sheet on a phone.
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await page.getByRole("button", { name: "Fråga AI" }).click();
      await page.getByRole("dialog", { name: "Fråga AI" }).waitFor();
      await ready(page);
    },
  },
  { name: "start", persona: "foretagare", go: (page) => open(page, "/start") },
  {
    // The first visit after a login: "Fråga AI" is open with its welcome, beside Start.
    name: "fraga-ai-valkomst",
    persona: "foretagare",
    isWelcome: true,
    go: async (page) => {
      // A phone is not interrupted: there the welcome waits in the panel until the reader opens it.
      if ((page.viewportSize()?.width ?? 1024) < 640) return "telefonen öppnar inte Fråga AI av sig själv";
      await open(page, "/start");
      await page.getByRole("dialog", { name: "Fråga AI" }).waitFor();
      await ready(page);
    },
  },
  {
    name: "kontomeny",
    persona: "foretagare",
    go: async (page) => {
      await open(page, "/start");
      await page.getByRole("button", { name: /^Konto: / }).click();
      await page.getByRole("dialog", { name: "Konto" }).waitFor();
      await ready(page);
    },
  },
  { name: "profil", persona: "foretagare", go: (page) => open(page, "/profil") },
  { name: "paminnelser", persona: "foretagare", go: (page) => open(page, "/paminnelser") },
  {
    name: "upphandling-granska",
    persona: "foretagare",
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await openStep(page, "Granska");
    },
  },
  {
    name: "upphandling-inlamning",
    persona: "foretagare",
    go: async (page) => {
      const skip = await openFirstNotice(page, true);
      if (skip) return skip;
      await openStep(page, "Lämna in");
    },
  },
  { name: "inkop-ko", persona: "inkopare", go: (page) => open(page, "/inkop") },
  { name: "inkop-ny", persona: "inkopare", go: (page) => open(page, "/inkop?flik=ny") },
  { name: "inkop-insikter", persona: "inkopare", go: (page) => open(page, "/inkop?flik=insikter") },
  // The jobs moved to Drift (/inkop/drift, in inköp's account menu); "/inkop?flik=jobb" redirects there.
  { name: "inkop-jobb", persona: "inkopare", go: (page) => open(page, "/inkop/drift") },
  {
    name: "inkop-granska-checklista",
    persona: "inkopare",
    go: async (page) => {
      await open(page, "/inkop?flik=granska");
      const links = page.getByRole("table", { name: "Checklistor" }).getByRole("link", { name: /^Granska / });
      if ((await links.count()) === 0) return "inga checklistor att granska";
      await links.first().click();
      await page.waitForURL(/\/inkop\/checklistor\//);
      // The h1 is the notice's title, with "Granska checklista" above it. Until the notice has loaded, the h1 (and on
      // wider screens the trail) says "Granska checklista" instead.
      const eyebrow = page.getByText("Granska checklista", { exact: true });
      await expect(eyebrow).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Granska checklista");
      await expect(eyebrow).toBeVisible();
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
    if (!state.isWelcome) await asReturningReader(page, baseURL ?? "");
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
