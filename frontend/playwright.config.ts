import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// The accessibility gate: `npm run gate`. It runs against a running, seeded app (the compose stack on
// http://127.0.0.1:3501 by default; BASE_URL points it elsewhere, e.g. the Vite dev server on 3502).
// PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome instead of Playwright's own Chromium.
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3501";

type Use = NonNullable<PlaywrightTestConfig["use"]>;
// A touch screen: Chromium then matches (pointer: coarse), so the theme's 44 px targets apply.
const phone = (width: number, height: number): Use => ({
  viewport: { width, height },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const laptop: Use = { viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/gate",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/gate-report" }]],
  use: {
    baseURL: BASE_URL,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    locale: "sv-SE",
    timezoneId: "Europe/Stockholm",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone-320-light", use: { ...phone(320, 640), colorScheme: "light" } },
    { name: "phone-390-dark", use: { ...phone(390, 844), colorScheme: "dark" } },
    { name: "laptop-1440-light", use: { ...laptop, colorScheme: "light" } },
    { name: "laptop-1440-dark", use: { ...laptop, colorScheme: "dark" } },
    { name: "zoom-200", use: { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, colorScheme: "light" } },
    { name: "forced-colors", use: { ...laptop, colorScheme: "light", forcedColors: "active" } },
  ],
});
