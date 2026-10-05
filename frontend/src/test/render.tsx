/**
 * Test helpers: a fetch stub that answers like the backend, and the whole app rendered at a path.
 * Plain fetch mocking keeps tests independent of a running backend and of any mocking library.
 */
import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { UserView } from "../api/types";
import { App } from "../App";
import { AppProviders } from "../AppProviders";
import { config, session } from "./fixtures";

export interface MockRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  status?: number;
  /** The JSON body to answer with, or a function of the parsed request body. */
  body?: unknown | ((requestBody: unknown) => unknown);
}

export interface RecordedCall {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

function requestUrl(input: RequestInfo | URL): URL {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(href, "http://localhost");
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body instanceof FormData) return body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

/** Stubs `fetch`. Unmatched requests get the backend's 404 shape, so a missing route fails visibly. */
export function mockApi(routes: MockRoute[]): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = parseBody(init?.body);
    calls.push({ method, path: url.pathname, search: url.search, body });
    const route = routes.find((candidate) => candidate.method === method && candidate.path === url.pathname);
    if (!route) {
      return new Response(JSON.stringify({ detail: `Ingen testdata för ${method} ${url.pathname}` }), { status: 404 });
    }
    const status = route.status ?? 200;
    const payload = typeof route.body === "function" ? route.body(body) : route.body;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

/** The configuration and session every page asks for. */
export function baseRoutes(user: UserView | null): MockRoute[] {
  return [
    { method: "GET", path: "/api/config", body: config },
    { method: "GET", path: "/api/session", body: session(user) },
  ];
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders queryClient={queryClient}>
        <App />
      </AppProviders>
    </MemoryRouter>,
  );
}
