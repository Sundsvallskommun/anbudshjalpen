import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { TopNavItem } from "@astryxdesign/core/TopNav";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useAdminChecklists } from "../api/queries";
import type { Role } from "../api/types";
import { plural } from "../lib/format";
import { backLink, isNavSelected, mainNav, toReviewCount, type NavEntry } from "./navigation";

/** How many checklists wait for inköp, for the badge on "Inköp"; undefined until known. */
function useToReviewCount(): number | undefined {
  const checklists = useAdminChecklists("all");
  return checklists.data ? toReviewCount(checklists.data) : undefined;
}

/** The badge on "Inköp" for the checklists to review, read as ", 1 checklista att granska"; nothing at zero. */
function ToReviewBadge() {
  const count = useToReviewCount();
  if (count === undefined || count === 0) return null;
  return (
    <>
      <Text type="inherit" aria-hidden="true">
        <Badge label={String(count)} variant="info" />
      </Text>
      <VisuallyHidden>{`, ${plural(count, "checklista", "checklistor")} att granska`}</VisuallyHidden>
    </>
  );
}

function entryLabel(entry: NavEntry) {
  if (entry.key !== "inkop") return undefined;
  return (
    <HStack as="span" gap={2} vAlign="center">
      {entry.label}
      <ToReviewBadge />
    </HStack>
  );
}

/** The main choices in the top bar on wider screens; the chosen one has the accent line. */
export function DesktopNavItems({ role, pathname }: { role: Role | null; pathname: string }) {
  return mainNav(role).map((entry) => (
    <TopNavItem key={entry.key} label={entry.label} href={entry.href} isSelected={isNavSelected(entry, pathname)}>
      {entryLabel(entry)}
    </TopNavItem>
  ));
}

/**
 * The phone's second header row: the main choices as underlined tabs on the pages they lead to, and a back link
 * ("‹ Upphandlingar") on a detail page. No hamburger: three choices fit in 358 px.
 */
export function PhoneNavRow({ role, pathname }: { role: Role | null; pathname: string }) {
  const back = backLink(pathname, role);
  if (back) {
    return (
      <HStack paddingInline={4} paddingBlock={2} vAlign="center">
        <Link href={back.href} isStandalone>
          <HStack as="span" gap={1} vAlign="center">
            <Icon icon="chevronLeft" size="sm" />
            {back.label}
          </HStack>
        </Link>
      </HStack>
    );
  }
  const entries = mainNav(role);
  const selected = entries.find((entry) => isNavSelected(entry, pathname))?.key ?? "";
  return (
    <HStack paddingInline={2}>
      <TabList aria-label="Huvudmeny" value={selected} onChange={() => undefined} layout="hug">
        {entries.map((entry) => (
          <Tab
            key={entry.key}
            value={entry.key}
            label={entry.label}
            href={entry.href}
            endContent={entry.key === "inkop" ? <ToReviewBadge /> : undefined}
          />
        ))}
      </TabList>
    </HStack>
  );
}
