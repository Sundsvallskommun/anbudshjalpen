import { Heading } from "@astryxdesign/core/Heading";
import { Item } from "@astryxdesign/core/Item";
import { Text } from "@astryxdesign/core/Text";
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

/** The line that says where a row's claim stands: "Källa: 6.1 Upphandlingsföreskrifter.pdf, s. 5". */
export function SourceLine({ children }: { children: ReactNode }) {
  return (
    <Text type="supporting">
      Källa: {children}
    </Text>
  );
}

/**
 * One row of a section card: what the row is about and, under it, its source. Neither the label nor the
 * description is ever cut off, so a long attachment name, date text or explanation wraps.
 */
export function SectionRow({
  label,
  description,
  source,
  startContent,
  endContent,
  isFlush = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** The row's source link, shown as "Källa: …" under the description. */
  source?: ReactNode;
  startContent?: ReactNode;
  endContent?: ReactNode;
  /** In a list that already sits on the card's inset, the row adds none of its own. */
  isFlush?: boolean;
}) {
  const body =
    source || description ? (
      <VStack gap={1}>
        {wrapping(description)}
        {source && <SourceLine>{source}</SourceLine>}
      </VStack>
    ) : undefined;
  return (
    <Item
      as="li"
      align="start"
      className={isFlush ? `${styles.row} ${styles.flush}` : styles.row}
      label={wrapping(label)}
      description={body}
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
