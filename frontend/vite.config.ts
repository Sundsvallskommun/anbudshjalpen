/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API in development (`uv run anbudsklar serve --reload --port 8500`); API_PROXY_TARGET points the dev
// server elsewhere, e.g. at the compose stack. The browser only ever talks to the Vite origin, so the
// backend's same-origin check sees PUBLIC_URL=http://127.0.0.1:3502.
const API = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8500";
const proxy = { "/api": API, "/health": API, "/mcp": API };

// light-dark() shipped in Chrome/Edge 123, Firefox 120 and Safari 17.5. Below these targets Lightning CSS
// (Vite 8's CSS minifier) rewrites every light-dark() into polyfill variables, which Astryx warns breaks
// theming and makes production CSS differ from development.
const cssTarget = ["chrome123", "edge123", "firefox120", "safari17.5"];

export default defineConfig({
  plugins: [react()],
  build: { cssTarget },
  server: { proxy },
  preview: { proxy },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    // Room for several of findBy*'s 3 s waits on a slow runner (src/test/setup.ts).
    testTimeout: 10_000,
  },
});
