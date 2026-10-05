import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LinkProvider } from "@astryxdesign/core/Link";
import sv from "@astryxdesign/core/locales/sv-SE.json";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { eneoTheme } from "./theme/built/eneo";

const MESSAGES = { "sv-SE": sv };

/**
 * The providers every page needs (the Eneo module pattern from Tal till text's ModuleProviders): server
 * state, the Swedish catalogue for the design system's own words, the built Eneo theme and the router's
 * link for every link the design system draws, so a link is a client navigation and not a page load.
 *
 * The colour mode follows the operating system ("system"); the theme's tokens are light-dark() values,
 * so no script decides it. React Router's Link reads `to`, which Astryx passes alongside `href`.
 */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <InternationalizationProvider locale="sv-SE" messages={MESSAGES}>
        <Theme theme={eneoTheme} mode="system">
          <LinkProvider component={RouterLink}>{children}</LinkProvider>
        </Theme>
      </InternationalizationProvider>
    </QueryClientProvider>
  );
}
