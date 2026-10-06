import { Badge } from "@astryxdesign/core/Badge";
import { useCollapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { plural } from "../../lib/format";
import { hashTarget, revealElement } from "../../lib/useRevealHash";
import styles from "./CollapsibleSection.module.css";

export interface CollapsibleSectionProps {
  /** The section's anchor, for statistic tiles and the outline ("skallkrav"): a link to it opens the section. */
  id: string;
  title: string;
  /** How many items the section holds: a count badge, and part of the button's name ("Skallkrav, 11 krav"). */
  count?: number;
  /** The words for the count in the name, singular and plural: ["krav", "krav"], ["bilaga", "bilagor"]. */
  countNoun?: readonly [one: string, many: string];
  /** One line under the heading: what the group is ("Måste vara uppfyllda. Annars kan anbudet inte antas."). */
  helper?: ReactNode;
  /** Whether the section starts open (direction.md: skallkrav and kvalificeringskrav open, the rest closed). */
  defaultOpen?: boolean;
  headingLevel?: 2 | 3 | 4;
  /** Rows that run edge to edge (default) or content with the card's padding. */
  isFlush?: boolean;
  /** Identifies the section in a CollapsibleGroup, which then decides what is open. */
  value?: string;
  children: ReactNode;
}

/**
 * A group with its count in the heading (direction.md, section 6): a card whose heading is the disclosure button,
 * with a count badge, a helper line and the given starting state. The count is part of the button's name, the
 * content stays mounted while closed (so anchors inside it resolve), and a link to the section itself ("#skallkrav",
 * from a statistic tile) or to an anchor inside it ("#krav-K12") opens it.
 */
export function CollapsibleSection({
  id,
  title,
  count,
  countNoun = ["post", "poster"],
  helper,
  defaultOpen = false,
  headingLevel = 3,
  isFlush = true,
  value,
  children,
}: CollapsibleSectionProps) {
  const [ownIsOpen, setOwnIsOpen] = useState(defaultOpen);
  const { isOpen, toggle } = useCollapsible({ isCollapsible: { isOpen: ownIsOpen, onOpenChange: setOwnIsOpen }, value });
  const revealTarget = useRef<HTMLElement | null>(null);
  const [revealRequest, setRevealRequest] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const helperId = helper ? `${baseId}-helper` : undefined;

  // A link to the section or to something inside it opens the section and shows the target, also when the page
  // arrives after the address (a link from another page to a lazily loaded notice). In a CollapsibleGroup the toggle
  // asks the group, so a group that opens the section itself for the same hash does not close it again.
  useEffect(() => {
    const target = hashTarget(hash);
    if (!target || !sectionRef.current?.contains(target)) return;
    if (!isOpen) toggle();
    revealTarget.current = target;
    setRevealRequest((request) => request + 1);
  }, [hash]);

  // The target is scrolled to once the section is open and drawn: a closed section's rows have no box, and the page
  // below a closed section may be too short to bring it up under the step bar.
  useEffect(() => {
    const target = revealTarget.current;
    if (!target || !isOpen) return;
    const frame = requestAnimationFrame(() => {
      revealTarget.current = null;
      revealElement(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [revealRequest, isOpen]);

  return (
    <VStack ref={sectionRef} as="section" id={id} aria-labelledby={triggerId} gap={0} className={styles.section}>
      <Heading level={headingLevel} className={styles.heading}>
        <button
          type="button"
          id={triggerId}
          className={styles.trigger}
          aria-expanded={isOpen}
          aria-controls={contentId}
          aria-describedby={helperId}
          onClick={toggle}
        >
          <Text type="inherit" className={styles.title}>
            {title}
          </Text>
          {count !== undefined && (
            <>
              <Text type="inherit" aria-hidden="true">
                <Badge label={String(count)} />
              </Text>
              <VisuallyHidden>{`, ${plural(count, countNoun[0], countNoun[1])}`}</VisuallyHidden>
            </>
          )}
          <Icon icon="chevronDown" size="md" className={styles.chevron} />
        </button>
      </Heading>
      {helper && (
        <Text as="div" type="supporting" id={helperId} className={styles.helper}>
          {helper}
        </Text>
      )}
      <VStack id={contentId} hidden={!isOpen} gap={0} className={isFlush ? styles.content : `${styles.content} ${styles.padded}`}>
        {children}
      </VStack>
    </VStack>
  );
}
