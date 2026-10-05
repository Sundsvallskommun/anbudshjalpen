import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav } from "@astryxdesign/core/TopNav";
import type { ReactNode } from "react";

/**
 * A page's frame: the notice band, the top bar, the skip link and the main region (Tal till text's
 * ModuleShell). It holds no state and decides nothing: the route that renders it says what the bar shows.
 */
export function ModuleShell({
  label,
  heading,
  start,
  end,
  banner,
  children,
}: {
  /** The navigation landmark's name. */
  label: string;
  /** The brand. */
  heading: ReactNode;
  /** The navigation items, after the heading. */
  start?: ReactNode;
  /** The account controls. */
  end?: ReactNode;
  /** A notice for the whole page, above the bar. */
  banner?: ReactNode;
  children: ReactNode;
}) {
  // "surface": one colour from the bar to the window's end. The page grows and the window scrolls. No
  // content padding here: each page's Layout owns it (shell/Page.tsx), so there is one inset owner.
  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={0}
      banner={banner}
      topNav={<TopNav label={label} heading={heading} startContent={start} endContent={end} />}
    >
      {children}
    </AppShell>
  );
}
