import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Outline, type OutlineItem } from "@astryxdesign/core/Outline";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useLayoutEffect, useState } from "react";
import type { IsoDate } from "../../../../api/types";
import { formatShortDate } from "../../../../lib/format";

/**
 * How far below the top a scrolled-to part lands: the page's own scroll padding, which keeps it clear of the sticky
 * step bar (app.css). The outline lands its targets there too and marks the part it scrolled to as current.
 */
function useScrollPaddingTop(): number {
  const [padding, setPadding] = useState(0);
  useLayoutEffect(() => {
    const value = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart);
    setPadding(Number.isFinite(value) ? value : 0);
  }, []);
  return padding;
}

/**
 * Step 1's rail (direction.md, section 4): "På den här sidan", an outline of the step's parts that stays in view, and
 * the reminder that the document always applies, with the date to ask by. `onNavigate` hears where the outline goes
 * before it scrolls, so a closed section can open first.
 */
export function RequirementsRail({
  items,
  questionDeadline,
  onNavigate,
}: {
  items: OutlineItem[];
  questionDeadline: IsoDate | null;
  onNavigate?: (id: string) => void;
}) {
  const offset = useScrollPaddingTop();
  return (
    <>
      <Card>
        <VStack gap={2}>
          <Text type="supporting" weight="semibold" color="primary">
            På den här sidan
          </Text>
          <Outline items={items} label="På den här sidan" density="compact" offset={offset} onNavigateStart={onNavigate} />
        </VStack>
      </Card>
      <Card>
        <VStack gap={1}>
          <Heading level={4} accessibilityLevel={2}>
            Något som inte stämmer?
          </Heading>
          <Text type="supporting">
            {`Det är alltid förfrågningsunderlaget som gäller. Ställ frågor i e-Avrop ${
              questionDeadline ? `senast ${formatShortDate(questionDeadline)}` : "före sista dag för frågor"
            }.`}
          </Text>
        </VStack>
      </Card>
    </>
  );
}
