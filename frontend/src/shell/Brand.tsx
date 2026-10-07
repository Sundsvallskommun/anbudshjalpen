import { TopNavHeading } from "@astryxdesign/core/TopNav";

/**
 * The brand at the start of the top bar: the mark, "Anbudsklar" and the organization below it. One link, to where the
 * user starts. The mark is Gnistan, the coach's speech bubble with a check and a spark for AI: public/favicon.svg,
 * the same file the browser tab and the home-screen icons are built from (`npm run icons`). It brings its own ground,
 * so it reads the same in light and dark mode; the name beside it says what it is, so the image is decorative. The
 * municipal arms are not used without clearance (direction.md, section 5).
 */
export function Brand({ href, organization }: { href: string; organization?: string }) {
  return (
    <TopNavHeading
      logo={<img src="/favicon.svg" alt="" width={28} height={28} />}
      heading="Anbudsklar"
      subheading={organization}
      headingHref={href}
    />
  );
}
