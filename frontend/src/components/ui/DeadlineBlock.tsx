import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import {
  formatClock,
  formatLongDate,
  formatShortDate,
  isClosingSoon,
  isPassed,
  relativeDays,
  type YearDisplay,
} from "../../lib/format";

export type DeadlineVariant = "inline" | "stack" | "compact";

export interface DeadlineBlockProps {
  /** A calendar date ("2026-10-30", the whole day counts) or a timestamp with a time of day. */
  deadline: string;
  /**
   * What the date is ("Sista anbudsdag"). Shown above the date in the stack variant and before it inline; in the
   * compact variant, and whenever `isLabelHidden` is set, it is read only by screen readers.
   */
  label?: string;
  isLabelHidden?: boolean;
  /**
   * inline: "9 nov kl. 23:59 · om 35 dagar" on one line, for sentences and the sticky step bar.
   * stack: the date large (23 px) with "kl. 23:59 · om 35 dagar" below, for key figures and cards.
   * compact: the date (19 px) with the relative time below, for list rows and rails.
   */
  variant?: DeadlineVariant;
  /** Whether the date shows its year; "auto" shows it only when it is not this year. */
  year?: YearDisplay;
  /** Aligns a stacked block's lines, e.g. "end" at the right edge of a list row. */
  align?: "start" | "end";
  /** Today, for tests. */
  now?: Date;
}

/** "om 35 dagar" in quiet text; at seven days or fewer a yellow token with a clock; grey "passerat" once passed. */
function Relative({ deadline, now }: { deadline: string; now: Date }) {
  const relative = relativeDays(deadline, now);
  if (isPassed(deadline, now)) {
    return <Text type="supporting">{relative}</Text>;
  }
  if (isClosingSoon(deadline, now)) {
    return (
      <HStack gap={1} vAlign="center">
        <VisuallyHidden>Stänger snart:</VisuallyHidden>{" "}
        <Token label={relative} color="yellow" size="sm" icon={<Icon icon="clock" size="sm" />} />
      </HStack>
    );
  }
  return <Text type="supporting">{relative}</Text>;
}

/** The date, large, in tabular figures; screen readers hear it written out ("9 november 2026 kl. 23:59"). */
function DateText({
  shown,
  spoken,
  size,
  isPassedDate,
}: {
  shown: string;
  spoken: string;
  size?: "lg" | "xl";
  isPassedDate: boolean;
}) {
  return (
    <>
      {/* A passed date is secondary, not "disabled": disabled grey is about 3:1 and fails WCAG 1.4.3. */}
      <Text size={size} weight="semibold" color={isPassedDate ? "secondary" : "primary"} hasTabularNumbers aria-hidden="true">
        {shown}
      </Text>
      <VisuallyHidden>{spoken}</VisuallyHidden>
    </>
  );
}

/**
 * The deadline as the anchor of every view (direction.md, principle 3): the same block in the list, the cards, the
 * header, the reminders and inköp's queue. The date is large and in tabular figures, the time is written "kl. 23:59"
 * and the relative time is always beside it. At seven days or fewer the relative time turns into a yellow token with
 * a clock ("Stänger snart" for screen readers); a passed date turns grey and says "passerat".
 */
export function DeadlineBlock({
  deadline,
  label,
  isLabelHidden = false,
  variant = "stack",
  year = "auto",
  align = "start",
  now = new Date(),
}: DeadlineBlockProps) {
  const passed = isPassed(deadline, now);
  const clock = formatClock(deadline);
  const date = formatShortDate(deadline, year, now);
  const spoken = `${formatLongDate(deadline, year === "never" ? "never" : "always", now)}${clock ? ` ${clock}` : ""}`;
  const isLabelVisible = Boolean(label) && !isLabelHidden && variant !== "compact";

  if (variant === "inline") {
    return (
      <HStack gap={1} vAlign="center" wrap="wrap">
        {label && (isLabelVisible ? <Text>{label}</Text> : <VisuallyHidden>{label}</VisuallyHidden>)}
        <DateText shown={clock ? `${date} ${clock}` : date} spoken={spoken} isPassedDate={passed} />
        <Text type="supporting" aria-hidden="true">
          ·
        </Text>
        <Relative deadline={deadline} now={now} />
      </HStack>
    );
  }

  const hAlign = align === "end" ? "end" : "start";
  return (
    <VStack gap={0.5} hAlign={hAlign}>
      {label && (isLabelVisible ? <Text type="supporting">{label}</Text> : <VisuallyHidden>{label}</VisuallyHidden>)}
      <DateText shown={date} spoken={spoken} size={variant === "stack" ? "xl" : "lg"} isPassedDate={passed} />
      <HStack gap={1} vAlign="center" wrap="wrap" hAlign={hAlign}>
        {variant === "stack" && clock && (
          <Text type="supporting" aria-hidden="true">
            {`${clock} ·`}
          </Text>
        )}
        <Relative deadline={deadline} now={now} />
      </HStack>
    </VStack>
  );
}
