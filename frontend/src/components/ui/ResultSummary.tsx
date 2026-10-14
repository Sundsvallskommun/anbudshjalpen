import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode, Ref } from "react";
import { StatTile } from "./StatTile";

export interface ResultFilter {
  value: string;
  /** "Bör åtgärdas". */
  label: string;
  count: number;
  /** One line of help under the label. */
  helper?: string;
}

export interface ResultSummaryProps {
  /** The verdict, with its number: "3 saker bör åtgärdas innan du lämnar anbudet". */
  title: string;
  headingLevel?: 2 | 3;
  /** "10 av 21 skall- och kvalificeringskrav ser bra ut", drawn as a bar. */
  progress?: { value: number; max: number; label: string; variant?: "accent" | "success" | "warning" };
  /** Figures that filter the rows below; one can be active at a time. */
  filters?: readonly ResultFilter[];
  /** The active filter's value, or null for all rows. */
  selected?: string | null;
  onSelectedChange?: (value: string | null) => void;
  /** A last line, such as "Bilagor i utkastet: 3 av 5" with a chip per attachment. */
  children?: ReactNode;
  /** The title, focusable, for a result that arrives after a wait and should be where the reader lands. */
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * The answer first (direction.md, principle 1): a title with the number, a progress bar and figures that act as
 * filters, on one card. Pressing an active filter again shows all rows.
 */
export function ResultSummary({
  title,
  headingLevel = 2,
  progress,
  filters = [],
  selected = null,
  onSelectedChange,
  children,
  titleRef,
}: ResultSummaryProps) {
  return (
    <Card>
      <VStack gap={4}>
        <Heading level={headingLevel} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
          {title}
        </Heading>
        {progress && (
          <ProgressBar
            label={progress.label}
            value={progress.value}
            max={Math.max(progress.max, 1)}
            variant={progress.variant ?? "success"}
          />
        )}
        {filters.length > 0 && (
          <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
            {filters.map((filter) => (
              <StatTile
                key={filter.value}
                value={filter.count}
                label={filter.label}
                helper={filter.helper}
                isSelected={selected === filter.value}
                onSelectedChange={(isSelected) => onSelectedChange?.(isSelected ? filter.value : null)}
              />
            ))}
          </Grid>
        )}
        {children}
      </VStack>
    </Card>
  );
}
