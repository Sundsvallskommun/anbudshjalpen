import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { useIsPhone } from "../../lib/usePhone";

export interface ViewOption<T extends string> {
  value: T;
  label: string;
}

/**
 * One choice among a few views of a list: a SegmentedControl, which shows every option at once (direction.md), and on
 * a phone a Selector, since a row of segments that does not wrap would be cut off at 320 px (WCAG 1.4.10).
 */
export function ViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: readonly ViewOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  const isPhone = useIsPhone();
  if (isPhone) {
    return (
      <Selector
        label={label}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
        value={value}
        onChange={(next) => onChange(next as T)}
        width="100%"
      />
    );
  }
  return (
    <HStack>
      <SegmentedControl label={label} value={value} onChange={(next) => onChange(next as T)} size={size}>
        {options.map((option) => (
          <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
        ))}
      </SegmentedControl>
    </HStack>
  );
}
