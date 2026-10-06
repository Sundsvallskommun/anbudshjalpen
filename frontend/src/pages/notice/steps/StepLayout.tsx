import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import styles from "./StepLayout.module.css";

export interface StepLayoutProps {
  children: ReactNode;
  /** The step's context beside it (direction.md, section 2 "Högerspalten"): the outline, the rules for questions, … */
  rail: ReactNode;
  /** The rail's name as a complementary landmark. */
  railLabel: string;
  /** Keep the rail in view below the step bar while the step scrolls (wide screens). */
  isRailSticky?: boolean;
  /** Where the rail goes below 1 024 px: after the step (default), before it, or nowhere (an outline needs width). */
  narrowRail?: "after" | "before" | "hidden";
}

/** A step's two columns: its content and its rail, stacked on narrow screens. */
export function StepLayout({ children, rail, railLabel, isRailSticky = false, narrowRail = "after" }: StepLayoutProps) {
  const railClasses = [
    isRailSticky ? styles.sticky : null,
    narrowRail === "hidden" ? styles.hiddenNarrow : null,
    narrowRail === "before" ? styles.firstNarrow : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <HStack className={styles.columns}>
      <VStack gap={4} className={styles.main}>
        {children}
      </VStack>
      <VStack as="aside" aria-label={railLabel} gap={4} className={railClasses || undefined}>
        {rail}
      </VStack>
    </HStack>
  );
}
