/**
 * Test helpers for the shared components: render one with the app's providers (query client, Swedish catalogue,
 * theme, router links and the source dialog) at an address, and show where the router is.
 */
import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AppProviders } from "../../AppProviders";

/** The router's current address as text, for asserting navigation: `screen.getByTestId("location")`. */
export function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <span data-testid="location">{`${pathname}${search}${hash}`}</span>;
}

export function renderWithProviders(ui: ReactNode, { path = "/" }: { path?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders queryClient={queryClient}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {ui}
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </AppProviders>
    </MemoryRouter>,
  );
  return { ...view, queryClient };
}
