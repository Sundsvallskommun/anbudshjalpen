import { Card, type CardProps } from "@astryxdesign/core/Card";
import styles from "./AccentCard.module.css";

/**
 * A Card with the accent edge on its start side (direction.md, section 6): "Nästa steg" at the end of a step and
 * Start's "Nästa frist". It takes every Card prop; use it for the one card in a view that leads on.
 */
export function AccentCard({ className, ...props }: CardProps) {
  return <Card {...props} className={className ? `${styles.card} ${className}` : styles.card} />;
}
