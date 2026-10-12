import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LayerProvider } from "@astryxdesign/core/Layer";
import { LinkProvider } from "@astryxdesign/core/Link";
import sv from "@astryxdesign/core/locales/sv-SE.json";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { AskAiProvider } from "./components/ask/AskAiProvider";
import { SourceDialogProvider } from "./components/ui/source/SourceDialogProvider";
import { AppearanceTheme } from "./shell/appearance";

const MESSAGES = { "sv-SE": sv };

/**
 * The providers every page needs (the Eneo module pattern from Tal till text's ModuleProviders): server
 * state, the Swedish catalogue for the design system's own words, the built Eneo theme, the router's
 * link for every link the design system draws (a link is a client navigation, not a page load), the
 * one toast viewport, and the app's one source dialog, which every "s. N" opens. Render it inside the router.
 *
 * The colour mode is the visitor's choice under "Utseende" (AppearanceTheme): light, dark or the device's
 * setting, which is the default. The theme's tokens are light-dark() values, so the mode only sets the
 * colour scheme. React Router's Link reads `to`, which Astryx passes alongside `href`.
 *
 * AskAiProvider owns the "Fråga AI" panel's conversations (decision 0014), so they follow the reader between pages.
 *
 * LayerProvider mounts the viewport that useToast() shows its toasts in ("Dold · Ångra", "Checklistan är
 * publicerad"), here inside the theme, the catalogue and the router: without it each toast falls back to a
 * detached viewport with English words ("Dismiss notification"), no Eneo theme and no router for its links.
 * AppShell does not mount one, and a nested LayerProvider passes through to this one.
 */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <InternationalizationProvider locale="sv-SE" messages={MESSAGES}>
        <AppearanceTheme>
          <LinkProvider component={RouterLink}>
            <LayerProvider>
              <SourceDialogProvider>
                <AskAiProvider>{children}</AskAiProvider>
              </SourceDialogProvider>
            </LayerProvider>
          </LinkProvider>
        </AppearanceTheme>
      </InternationalizationProvider>
    </QueryClientProvider>
  );
}
