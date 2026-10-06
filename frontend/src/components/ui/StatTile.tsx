import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useLocation } from "react-router";

interface StatTileContent {
  /** The figure, large: 11, "70/30". */
  value: string | number;
  /** What it counts: "skallkrav". */
  label: string;
  /** One line of help: "måste uppfyllas". */
  helper?: string;
}

/** An anchor to a section on the page ("#skallkrav"), or any other address. */
interface LinkTile extends StatTileContent {
  href: string;
}

/** A filter that shows only some rows; selected while it filters. */
interface FilterTile extends StatTileContent {
  isSelected: boolean;
  onSelectedChange: (isSelected: boolean) => void;
}

export type StatTileProps = LinkTile | FilterTile;

function isFilter(props: StatTileProps): props is FilterTile {
  return "onSelectedChange" in props;
}

function TileContent({ value, label, helper, isAnchor }: StatTileContent & { isAnchor: boolean }) {
  return (
    <VStack gap={0.5}>
      <HStack gap={2} vAlign="start" hAlign="between">
        <Text size="2xl" weight="semibold" hasTabularNumbers>
          {value}
        </Text>
        {isAnchor && <Icon icon="arrowDown" color="accent" size="sm" />}
      </HStack>
      <Text weight="medium">{label}</Text>
      {helper && <Text type="supporting">{helper}</Text>}
    </VStack>
  );
}

/**
 * A figure the reader can act on (direction.md, section 6): 28 px number, label and helper line, as a card. With
 * `href` it is a link (an anchor such as "#skallkrav" scrolls to and opens that section); with `isSelected` and
 * `onSelectedChange` it is a filter. The whole card is the target and its name reads "11 skallkrav, måste uppfyllas".
 */
export function StatTile(props: StatTileProps) {
  const { value, label, helper } = props;
  const { search } = useLocation();
  const name = `${value} ${label}${helper ? `, ${helper}` : ""}`;
  if (isFilter(props)) {
    return (
      <SelectableCard label={`Visa bara: ${name}`} isSelected={props.isSelected} onChange={props.onSelectedChange} padding={4}>
        <TileContent value={value} label={label} helper={helper} isAnchor={false} />
      </SelectableCard>
    );
  }
  return (
    // An anchor keeps the page's own parameters (the step in ?flik=), which a bare "#…" would drop.
    <ClickableCard label={name} href={props.href.startsWith("#") ? `${search}${props.href}` : props.href} padding={4}>
      <TileContent value={value} label={label} helper={helper} isAnchor={props.href.startsWith("#")} />
    </ClickableCard>
  );
}
