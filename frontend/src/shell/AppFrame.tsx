import { Outlet } from "react-router";
import { useConfig, useSession } from "../api/queries";
import { useRevealHash } from "../lib/useRevealHash";
import { AboutDemoProvider } from "./AboutDemo";
import { FrameHeader } from "./FrameHeader";
import { ModuleShell } from "./ModuleShell";
import { PhaseStrip } from "./PhaseStrip";
import { SiteFooter } from "./SiteFooter";

/**
 * The frame around every route: the demo strip that is always visible, the top bar with the brand, the role's main
 * choices and the account, the page, and the foot after the main region. "Om demon och AI" opens from the strip and
 * the foot.
 */
export function AppFrame() {
  const session = useSession();
  const config = useConfig();
  const user = session.data?.user ?? null;
  const organization = config.data?.organization_name;
  useRevealHash();

  return (
    <AboutDemoProvider config={config.data}>
      <ModuleShell
        banner={<PhaseStrip />}
        header={<FrameHeader user={user} organization={organization} />}
        footer={<SiteFooter organization={organization} />}
      >
        <Outlet />
      </ModuleShell>
    </AboutDemoProvider>
  );
}
