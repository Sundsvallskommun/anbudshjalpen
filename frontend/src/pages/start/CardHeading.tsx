import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import type { ReactNode } from "react";
import { plural } from "../../lib/format";

/**
 * A small card's heading (the rail's cards on Start and Upphandlingar): a level-2 heading in the page outline, set at
 * the card size of the design (19 px) so it fits the 360 px rail on one line.
 */
export function CardHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Heading level={3} accessibilityLevel={2} id={id}>
      {children}
    </Heading>
  );
}

/**
 * A count beside a heading's words ("Nya träffar 2"): a badge on screen, and words in the heading's name, so a screen
 * reader hears "Nya träffar, 2 träffar" rather than a bare number.
 */
export function HeadingCount({ count, noun }: { count: number; noun: readonly [one: string, many: string] }) {
  return (
    <>
      <Badge label={String(count)} aria-hidden="true" />
      <VisuallyHidden>{`, ${plural(count, noun[0], noun[1])}`}</VisuallyHidden>
    </>
  );
}
