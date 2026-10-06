import { AppShell } from "@astryxdesign/core/AppShell";
import type { ReactNode } from "react";

/**
 * A page's frame: the demo strip, the top bar, the skip link, the main region and the site's foot (Tal till text's
 * ModuleShell). It holds no state and decides nothing: the route that renders it says what the bar shows.
 */
export function ModuleShell({
  header,
  banner,
  footer,
  children,
}: {
  /** The top bar: brand, navigation and account. */
  header: ReactNode;
  /** A notice for the whole page, above the bar (the demo strip). */
  banner?: ReactNode;
  /**
   * The site's foot, after the main region and outside it: a contentinfo landmark inside main is not top level
   * (axe landmark-contentinfo-is-top-level). AppShell has no slot for it, so it follows the shell.
   */
  footer?: ReactNode;
  children: ReactNode;
}) {
  // "section": the header (strip and bar) on the white surface with a divider below, the page on the body grey (the
  // theme gives the shell's root the body colour, and lets it be as tall as its content so the foot follows the page
  // instead of waiting below a full screen). The page grows and the window scrolls. No content padding here: each
  // page's Layout owns it (shell/Page.tsx), so there is one inset owner. No mobile drawer: a phone shows the main
  // choices on a second header row instead of behind a hamburger.
  return (
    <>
      <AppShell height="auto" variant="section" contentPadding={0} mobileNav={false} banner={banner} topNav={header}>
        {children}
      </AppShell>
      {footer}
    </>
  );
}
