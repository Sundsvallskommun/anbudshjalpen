import type { ReactNode } from "react";
import styles from "./RowList.module.css";

/**
 * A list of records as rows divided by lines. `role="list"` is explicit because Safari drops a list's
 * semantics when its bullets are removed.
 */
export function RowList({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul role="list" aria-label={label} className={styles.list}>
      {children}
    </ul>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <li className={styles.row}>{children}</li>;
}
