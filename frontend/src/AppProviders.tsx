import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LayerProvider } from "@astryxdesign/core/Layer";
import { LinkProvider } from "@astryxdesign/core/Link";
import sv from "@astryxdesign/core/locales/sv-SE.json";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { SourceDialogProvider } from "./components/ui/source/SourceDialogProvider";
import { eneoTheme } from "./theme/built/eneo";

const MESSAGES = { "sv-SE": sv };

/**
 * The providers every page needs (the Eneo module pattern from Tal till text's ModuleProviders): server
 * state, the Swedish catalogue for the design system's own words, the built Eneo theme, the router's
 * link for every link the design system draws (a link is a client navigation, not a page load), the
 * one toast viewport, and the app's one source dialog, which every "s. N" opens. Render it inside the router.
 *
 * The colour mode follows the operating system ("system"); the theme's tokens are light-dark() values,
 * so no script decides it. React Router's Link reads `to`, which Astryx passes alongside `href`.
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
        <Theme theme={eneoTheme} mode="system">
          <LinkProvider component={RouterLink}>
            <LayerProvider>
              <SourceDialogProvider>{children}</SourceDialogProvider>
            </LayerProvider>
          </LinkProvider>
        </Theme>
      </InternationalizationProvider>
    </QueryClientProvider>
  );
}
