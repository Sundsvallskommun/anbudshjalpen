import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { APPEARANCES, isAppearance, useAppearance } from "./appearance";

/**
 * "Utseende": Ljust, Mörkt or Automatiskt, which follows the computer's or phone's setting. In the account menu it
 * stands under its word, with a line on what Automatiskt does; in the foot it sits on one line. Each segment is as
 * wide as its word, so "Automatiskt" is never cut off, and the stacked control hugs its segments instead of
 * stretching to the menu's width, which left an empty track to the right. The visible word is also the control's name (WCAG 2.5.3), so
 * screen readers hear it once, from the control.
 */
export function AppearanceControl({ layout = "inline" }: { layout?: "inline" | "stacked" }) {
  const { appearance, setAppearance } = useAppearance();
  const isStacked = layout === "stacked";
  const word = (
    <Text type="supporting" aria-hidden="true">
      Utseende
    </Text>
  );
  const control = (
    <SegmentedControl
      label="Utseende"
      value={appearance}
      onChange={(value) => {
        if (isAppearance(value)) setAppearance(value);
      }}
      size="sm"
    >
      {APPEARANCES.map((choice) => (
        <SegmentedControlItem key={choice.value} value={choice.value} label={choice.label} />
      ))}
    </SegmentedControl>
  );

  if (isStacked) {
    return (
      <VStack gap={1} hAlign="start">
        {word}
        {control}
        <Text type="supporting">Automatiskt följer datorns eller telefonens inställning.</Text>
      </VStack>
    );
  }
  return (
    <HStack gap={2} vAlign="center">
      {word}
      {control}
    </HStack>
  );
}
