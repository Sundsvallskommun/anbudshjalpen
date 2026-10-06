import { Icon } from "@astryxdesign/core/Icon";
import { TopNavHeading } from "@astryxdesign/core/TopNav";
import { LogoMark } from "../components/ui/icons";

/**
 * The brand at the start of the top bar: the mark (a document with a folded corner and a check, 24 px in the accent),
 * "Anbudsklar" and the organization below it. One link, to where the user starts. The municipal arms are not used
 * without clearance (direction.md, section 5).
 */
export function Brand({ href, organization }: { href: string; organization?: string }) {
  return (
    <TopNavHeading
      logo={<Icon icon={LogoMark} size="lg" color="accent" />}
      heading="Anbudsklar"
      subheading={organization}
      headingHref={href}
    />
  );
}
