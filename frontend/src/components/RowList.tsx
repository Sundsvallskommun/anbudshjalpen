import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import styles from "./RowList.module.css";

export interface RowListProps {
  /** The list's name for screen readers ("Upphandlingar"). */
  label?: string;
  children: ReactNode;
  /** "ol" when the order carries meaning, such as a timeline. */
  as?: "ul" | "ol";
  /**
   * Rows edge to edge inside a card without padding (`<Card padding={0}>`): each row gets the card's inset (20 px,
   * 16 on a phone) and the hover tint follows the card's corners.
   */
  isInset?: boolean;
}

/**
 * A list of records as rows divided by lines. `role="list"` is explicit because Safari drops a list's
 * semantics when its bullets are removed.
 */
export function RowList({ label, children, as: List = "ul", isInset = false }: RowListProps) {
  return (
    <List role="list" aria-label={label} className={isInset ? `${styles.list} ${styles.inset}` : styles.list}>
      {children}
    </List>
  );
}

export interface RowProps {
  children: ReactNode;
  /**
   * The whole row is the target of the RowLink inside it (the record's title): one link, one tab stop and a name
   * that is just the title, while a click anywhere on the row follows it. Put no other control in such a row.
   */
  isLinked?: boolean;
}

export function Row({ children, isLinked = false }: RowProps) {
  return <li className={isLinked ? `${styles.row} ${styles.linked}` : styles.row}>{children}</li>;
}

/**
 * The record's title as the link of a linked row: semibold in the text colour, since the row's hover tint and the
 * underline say it can be clicked. `maxLines` cuts a long title off with an ellipsis (the full title stays in the
 * accessible name).
 */
export function RowLink({ href, maxLines, children }: { href: string; maxLines?: number; children: ReactNode }) {
  return (
    <Link href={href} color="primary" weight="semibold" maxLines={maxLines} className={styles.rowLink}>
      {children}
    </Link>
  );
}

/**
 * The end column of a row or a header (a deadline, a figure): it keeps its width while the start column wraps. Text
 * may break anywhere (the theme's overflow-wrap), so without this a narrow row squeezes "30 okt" into one letter per
 * line. `width` gives a column of the same width on every row, aligned at its end.
 */
export function RowEnd({ width, children }: { width?: number; children: ReactNode }) {
  return (
    <VStack width={width} hAlign="end" className={styles.end}>
      {children}
    </VStack>
  );
}
