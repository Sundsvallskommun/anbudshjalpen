import { Heading } from "@astryxdesign/core/Heading";
import { Item } from "@astryxdesign/core/Item";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import styles from "./SectionRow.module.css";

/**
 * The rows of a section card, as a list. `role="list"` is explicit because Safari drops a list's semantics when its
 * bullets are removed.
 */
export function SectionRows({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <VStack as="ul" gap={0} role="list" aria-label={label} className={styles.list}>
      {children}
    </VStack>
  );
}

/**
 * Text for a row's slot that wraps instead of being cut off: the design system ends a string label or description
 * after one line with "…", so a term's explanation or a date's detail would lose its end (WCAG 1.4.10).
 */
export function wrapping(text: ReactNode): ReactNode {
  if (typeof text !== "string") return text;
  return text ? <>{text}</> : undefined;
}

/**
 * One row of a section card: what the row is about and, at the end, its source. Neither the label nor the
 * description is ever cut off, so a long attachment name, date text or explanation wraps.
 */
export function SectionRow({
  label,
  description,
  startContent,
  endContent,
  isFlush = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  startContent?: ReactNode;
  endContent?: ReactNode;
  /** In a list that already sits on the card's inset, the row adds none of its own. */
  isFlush?: boolean;
}) {
  return (
    <Item
      as="li"
      align="start"
      className={isFlush ? `${styles.row} ${styles.flush}` : styles.row}
      label={wrapping(label)}
      description={wrapping(description)}
      startContent={startContent}
      endContent={endContent}
    />
  );
}

/** The heading of a part of a section card ("Före anbudet", "Bara i vissa fall (2)"), below the section's own h3. */
export function SectionSubheading({ children }: { children: string }) {
  return (
    <Heading level={5} accessibilityLevel={4} color="secondary" className={styles.subheading}>
      {children}
    </Heading>
  );
}

/** The fixed-width date column of a date row. */
export const dateColumnClass = styles.date;
/** A disclosure nested in a section card, on the card's inset with a divider above. */
export const nestedClass = styles.nested;
