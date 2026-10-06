import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "../../components/ui/icons";

/**
 * A standalone link onward with the arrow after it: "Visa alla upphandlingar →", "Öppna Regelhjälpen →". Short words
 * on a phone ("Alla") carry the rest in visually hidden text, so the link's name still says where it goes.
 */
export function ForwardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <HStack gap={1} vAlign="center">
      <Link href={href} isStandalone weight="medium">
        {children}
      </Link>
      <Icon icon={ArrowRightIcon} size="sm" color="accent" />
    </HStack>
  );
}
