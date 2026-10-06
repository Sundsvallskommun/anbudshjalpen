import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { TopNav } from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { useLocation } from "react-router";
import type { UserView } from "../api/types";
import { useIsPhone } from "../lib/usePhone";
import { AccountMenu, LoginButton } from "./AccountMenu";
import { Brand } from "./Brand";
import { DesktopNavItems, PhoneNavRow } from "./MainNav";
import { homePath } from "./navigation";

/** Wide enough to show the name and company beside the avatar. */
const WIDE_QUERY = "(width >= 1024px)";

/**
 * The top bar (direction.md, section 3). Wider screens: the brand, the role's main choices with the chosen one
 * underlined, and the account at the end, in one 64 px bar. A phone: the brand and the avatar on a 56 px row, and
 * below it the main choices as tabs, or a back link on a detail page. The bar scrolls away with the page.
 */
export function FrameHeader({ user, organization }: { user: UserView | null; organization?: string }) {
  const isPhone = useIsPhone();
  const isWide = useMediaQuery(WIDE_QUERY);
  const { pathname } = useLocation();
  const role = user?.role ?? null;
  const account = user ? <AccountMenu user={user} isWide={isWide} /> : <LoginButton />;

  if (isPhone) {
    return (
      <VStack gap={0}>
        <HStack hAlign="between" vAlign="center" gap={2} paddingInline={4} paddingBlock={1}>
          <Brand href={homePath(role)} />
          {account}
        </HStack>
        <PhoneNavRow role={role} pathname={pathname} />
      </VStack>
    );
  }
  return (
    <TopNav
      label="Huvudmeny"
      heading={<Brand href={homePath(role)} organization={organization} />}
      startContent={<DesktopNavItems role={role} pathname={pathname} />}
      endContent={account}
    />
  );
}
