import { TopNavHeading } from "@astryxdesign/core/TopNav";

/**
 * The brand at the start of the top bar: the mark, "Anbudshjälpen" and the organization below it. One link, to where
 * the user starts. The mark is Toppen, two nested chevrons that form an A and point up: public/favicon.svg, the same
 * file the browser tab and the home-screen icons are built from (`npm run icons`). It brings its own ground,
 * so it reads the same in light and dark mode; the name beside it says what it is, so the image is decorative. The
 * municipal arms are not used without clearance (direction.md, section 5).
 */
export function Brand({ href, organization }: { href: string; organization?: string }) {
  return (
    <TopNavHeading
      logo={<img src="/favicon.svg" alt="" width={28} height={28} />}
      heading="Anbudshjälpen"
      subheading={organization}
      headingHref={href}
    />
  );
}
