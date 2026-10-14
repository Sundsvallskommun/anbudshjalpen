import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import { AccentCard } from "./AccentCard";

/**
 * "Nästa steg" at the end of a step (direction.md, principle 2): one sentence and one button, on a card with an
 * accent edge. The button is the view's primary action when the step has no other (one primary per view).
 */
export function NextStepCard({
  text,
  action,
  title = "Nästa steg",
  headingLevel = 2,
}: {
  /** One sentence: "Undrar du något om kraven?". */
  text: string;
  /** One Button (or two: the primary and a secondary one, such as the link to e-Avrop). */
  action: ReactNode;
  title?: string;
  headingLevel?: 2 | 3;
}) {
  return (
    <AccentCard>
      <VStack gap={3} hAlign="start">
        <VStack gap={1}>
          <Heading level={headingLevel}>{title}</Heading>
          <Text>{text}</Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          {action}
        </HStack>
      </VStack>
    </AccentCard>
  );
}
