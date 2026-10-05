import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import { TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useConfig, useLogout, useSession } from "../api/queries";
import type { AppConfig, Role, UserView } from "../api/types";
import { ModuleShell } from "./ModuleShell";

interface NavEntry {
  label: string;
  href: string;
  roles?: Role[];
}

const NAV: NavEntry[] = [
  { label: "Upphandlingar", href: "/" },
  { label: "Bevakning", href: "/bevakning", roles: ["foretagare"] },
  { label: "Påminnelser", href: "/paminnelser", roles: ["foretagare"] },
  { label: "Profil", href: "/profil", roles: ["foretagare"] },
  { label: "Inköp", href: "/inkop", roles: ["inkopare"] },
  { label: "Regelhjälpen", href: "/regelhjalpen" },
];

/** Shown until the configuration has loaded, and if it cannot load: the notice is never missing. */
const FALLBACK_DEMO_NOTICE = "Det här är en demo. Upphandlingsunderlag, företag och personer är fiktiva.";
const FALLBACK_AI_DISCLOSURE =
  "Anbudsklar använder AI för att tolka underlag och svara på frågor. AI kan ha fel: kontrollera alltid mot underlaget.";

export function isNavSelected(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/upphandlingar/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The demo notice and the AI disclosure, on every page and not dismissable. */
function NoticeBand({ config }: { config: AppConfig | undefined }) {
  return (
    <Banner
      status="info"
      container="section"
      collapsible={false}
      title={config?.demo_notice ?? FALLBACK_DEMO_NOTICE}
      description={config?.ai_disclosure ?? FALLBACK_AI_DISCLOSURE}
    />
  );
}

function UserName({ user }: { user: UserView }) {
  return (
    <VStack gap={0}>
      <Text weight="semibold">{user.name}</Text>
      <Text type="supporting">{user.company?.name ?? "Inköp"}</Text>
    </VStack>
  );
}

/** Who is logged in and the way out; on a phone folded into a "Konto" popover to leave the bar room. */
function AccountControls({ user }: { user: UserView | null }) {
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isMobile } = useAppShellMobile();

  if (!user) {
    if (pathname === "/logga-in") return null;
    return (
      <Button label="Logga in" variant="primary" size="sm" href={`/logga-in?till=${encodeURIComponent(pathname)}`} />
    );
  }
  const logoutButton = (
    <Button
      label="Logga ut"
      size="sm"
      variant={isMobile ? "secondary" : "ghost"}
      isLoading={logout.isPending}
      onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
    />
  );
  if (isMobile) {
    return (
      <Popover
        label="Konto"
        placement="below"
        alignment="end"
        content={
          <VStack gap={3} padding={3} hAlign="start">
            <UserName user={user} />
            {logoutButton}
          </VStack>
        }
      >
        <Button label="Konto" size="sm" variant="ghost" />
      </Popover>
    );
  }
  return (
    <HStack gap={3} vAlign="center">
      <UserName user={user} />
      {logoutButton}
    </HStack>
  );
}

/** The frame around every route: brand, navigation for the signed-in role, account and notices. */
export function AppFrame() {
  const session = useSession();
  const config = useConfig();
  const { pathname } = useLocation();
  const user = session.data?.user ?? null;
  const entries = NAV.filter((entry) => !entry.roles || (user !== null && entry.roles.includes(user.role)));

  return (
    <ModuleShell
      label="Huvudmeny"
      heading={
        <TopNavHeading heading="Anbudsklar" headingHref="/" subheading={config.data?.organization_name} />
      }
      start={entries.map((entry) => (
        <TopNavItem
          key={entry.href}
          label={entry.label}
          href={entry.href}
          isSelected={isNavSelected(entry.href, pathname)}
        />
      ))}
      end={<AccountControls user={user} />}
      banner={<NoticeBand config={config.data} />}
    >
      <Outlet />
    </ModuleShell>
  );
}
