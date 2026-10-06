import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { StackItem } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useNoticeBuyers, type BuyerFilters } from "../../api/queries";
import type { NoticeCounts, NoticeSort } from "../../api/types";
import { formatNumber } from "../../lib/format";
import { useDebouncedValue } from "../../lib/hooks";
import { useIsPhone } from "../../lib/usePhone";
import {
  sortChoices,
  SOURCES,
  STATUS_CHOICES,
  type ListState,
  type SourceChoice,
  type StatusChoice,
} from "./listState";

const ALL_SOURCES = "alla";
/** The buyer choice's value for no buyer; never a buyer's name, which the backend trims and never leaves empty. */
const ALL_BUYERS = "";
/** The search field's width on wider screens (direction.md: about 560 px); a phone gives it the whole row. */
const SEARCH_WIDTH = 560;
/** A buyer list longer than this gets a search field: a Selector reads well up to about eight options. */
const BUYERS_WITHOUT_SEARCH = 8;

/**
 * The search field: the list follows the text as the user types (after a pause, or at once on Enter). The text lives
 * here while the address holds the committed search, so a link that changes the search (the main menu's
 * "Upphandlingar") empties the field without sending the old text again.
 */
function SearchField({ q, onCommit }: { q: string; onCommit: (q: string) => void }) {
  const isPhone = useIsPhone();
  const [text, setText] = useState(q);
  const debouncedText = useDebouncedValue(text, 300);
  // The search this field last put in the address; any other `q` came from outside (a link, back, "Rensa filter").
  const ownQ = useRef(q);

  const commit = (value: string) => {
    const next = value.trim();
    if (next === q) return;
    ownQ.current = next;
    onCommit(next);
  };

  useEffect(() => {
    commit(debouncedText);
    // Only the typed text drives this; `q` follows it through the address.
  }, [debouncedText]);

  useEffect(() => {
    if (q === ownQ.current) return;
    ownQ.current = q;
    setText(q);
  }, [q]);

  return (
    <TextInput
      label="Sök bland upphandlingar"
      isLabelHidden
      value={text}
      onChange={setText}
      onEnter={() => commit(text)}
      startIcon="search"
      hasClear
      placeholder={isPhone ? "Sök, till exempel målning" : "Sök, till exempel målning eller städning"}
      width={isPhone ? "100%" : SEARCH_WIDTH}
    />
  );
}

/** "Öppna 12 · Planerade 1 · Alla 168": what each choice holds with the other filters, before it is chosen. */
function StatusControl({
  status,
  counts,
  onChange,
}: {
  status: StatusChoice;
  counts: NoticeCounts | undefined;
  onChange: (status: StatusChoice) => void;
}) {
  const isPhone = useIsPhone();
  return (
    <SegmentedControl
      label="Visa upphandlingar"
      value={status}
      onChange={(value) => onChange(value as StatusChoice)}
      layout={isPhone ? "fill" : "hug"}
    >
      {STATUS_CHOICES.map((choice) => (
        <SegmentedControlItem
          key={choice.value}
          value={choice.value}
          label={counts ? `${choice.label} ${formatNumber(counts[choice.value])}` : choice.label}
        />
      ))}
    </SegmentedControl>
  );
}

/** The list's order as a choice, for the filter popover on a phone (wider screens have it beside the result line). */
export interface SortOption {
  value: NoticeSort;
  onChange: (sort: NoticeSort) => void;
}

function SortPicker({ q, sort }: { q: string; sort: SortOption }) {
  return (
    <Selector
      label="Sortera"
      options={sortChoices(q).map(({ value, label }) => ({ value, label }))}
      value={sort.value}
      onChange={(value) => sort.onChange(value as NoticeSort)}
      width="100%"
    />
  );
}

/** "Källa": where the notices come from (e-Avrop, TED, the demo's own, or entered by inköp). */
function SourcePicker({
  source,
  onChange,
}: {
  source: SourceChoice | null;
  onChange: (source: SourceChoice | null) => void;
}) {
  return (
    <Selector
      label="Källa"
      options={[{ value: ALL_SOURCES, label: "Alla källor" }, ...SOURCES.map(({ value, label }) => ({ value, label }))]}
      value={source ?? ALL_SOURCES}
      onChange={(value) => onChange(value === ALL_SOURCES ? null : (value as SourceChoice))}
      width="100%"
    />
  );
}

/**
 * "Köpare": every buyer with how many notices the list shows when it is chosen ("Timrå kommun (3)"), most first. The
 * counts follow the other filters. A buyer that lists nothing now (an old link, another status) stays chosen, with 0.
 */
function BuyerPicker({
  buyer,
  filters,
  onChange,
}: {
  buyer: string | null;
  filters: BuyerFilters;
  onChange: (buyer: string | null) => void;
}) {
  const buyers = useNoticeBuyers(filters);
  const items = buyers.data?.items ?? [];
  const unlisted = buyer !== null && !items.some((item) => item.name === buyer) ? buyer : null;
  const options = [
    { value: ALL_BUYERS, label: "Alla köpare" },
    ...items.map((item) => ({ value: item.name, label: `${item.name} (${formatNumber(item.count)})` })),
    ...(unlisted === null ? [] : [{ value: unlisted, label: buyers.isSuccess ? `${unlisted} (0)` : unlisted }]),
  ];
  return (
    <Selector
      label="Köpare"
      options={options}
      value={buyer ?? ALL_BUYERS}
      onChange={(value) => onChange(value === ALL_BUYERS ? null : value)}
      isLoading={buyers.isPending}
      hasSearch={items.length > BUYERS_WITHOUT_SEARCH}
      searchPlaceholder="Sök köpare"
      emptySearchText="Ingen köpare matchar"
      status={buyers.isError ? { type: "error", message: "Köparna kunde inte hämtas." } : undefined}
      width="100%"
    />
  );
}

/**
 * "Fler filter": the source and the buyer, in a popover that applies each choice at once. On a phone it is an icon
 * by the search and also holds the order, so the list starts higher up. The buyers are fetched while it is open.
 * Each choice is a selector, which keeps the popover short enough to fit under (or over) its button at 320 px and at
 * 200 % zoom: the popover does not scroll, and a taller one would leave its last choice off the screen.
 */
function MoreFilters({
  state,
  buyerFilters,
  sort,
  triggerRef,
  onChange,
}: {
  state: ListState;
  buyerFilters: BuyerFilters;
  /** Offered only on a phone, and only when there is more than one notice to order. */
  sort: SortOption | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onChange: (changes: Partial<ListState>) => void;
}) {
  const isPhone = useIsPhone();
  const [isOpen, setIsOpen] = useState(false);
  const label = isPhone ? "Filter och sortering" : "Fler filter";
  return (
    <Popover
      label={label}
      width={320}
      alignment="end"
      onOpenChange={setIsOpen}
      content={
        <VStack gap={4} padding={4}>
          {isPhone && sort && <SortPicker q={state.q} sort={sort} />}
          <SourcePicker source={state.source} onChange={(source) => onChange({ source })} />
          {isOpen && (
            <BuyerPicker buyer={state.buyer} filters={buyerFilters} onChange={(buyer) => onChange({ buyer })} />
          )}
        </VStack>
      }
    >
      <Button
        ref={triggerRef}
        label={label}
        icon={<Icon icon="funnel" />}
        isIconOnly={isPhone}
        tooltip={isPhone ? label : undefined}
      />
    </Popover>
  );
}

/**
 * The active source and buyer as chips that remove them. A removed chip takes its button with it, so the focus goes to
 * "Fler filter", where the filter can be chosen again, instead of being lost.
 */
function FilterChips({
  state,
  onRemove,
}: {
  state: ListState;
  onRemove: (changes: Partial<ListState>) => void;
}) {
  const source = SOURCES.find((choice) => choice.value === state.source);
  if (!source && !state.buyer) return null;
  return (
    <>
      {source && <Token label={`Källa: ${source.label}`} onRemove={() => onRemove({ source: null })} />}
      {state.buyer && <Token label={`Köpare: ${state.buyer}`} onRemove={() => onRemove({ buyer: null })} />}
    </>
  );
}

export interface FitOption {
  /** What the profile says the company does, by name: "Målning, Målning av byggnader". */
  labels: readonly string[];
  /** Whether the profile has any CPV codes to filter by. */
  isAvailable: boolean;
}

/**
 * "Visa bara det som passar er" for a signed-in company: the profile's CPV codes as the list's CPV filter. A profile
 * without codes gets the way to add them instead. A phone leaves out which codes it uses, to keep the list near the
 * top; the result line still says "verkar passa er".
 */
function FitSwitch({ fit, isOn, onChange }: { fit: FitOption; isOn: boolean; onChange: (isOn: boolean) => void }) {
  const isPhone = useIsPhone();
  if (!fit.isAvailable) {
    return (
      <Text type="supporting">
        Ange vad ni gör i <Link href="/profil">företagsprofilen</Link>, så kan listan visa bara det som passar er.
      </Text>
    );
  }
  return (
    <HStack gap={4} vAlign="center" wrap="wrap">
      <Switch label="Visa bara det som passar er" value={isOn} onChange={onChange} />
      {!isPhone && fit.labels.length > 0 && (
        <Text type="supporting">{`Utgår från er profil: ${fit.labels.join(", ")}`}</Text>
      )}
    </HStack>
  );
}

export interface NoticeFilterBarProps {
  state: ListState;
  counts: NoticeCounts | undefined;
  /** The list's filters but the buyer and the paging: the buyer choices are counted with them. */
  buyerFilters: BuyerFilters;
  /** The fit filter, for a signed-in company only. */
  fit: FitOption | null;
  /** The list's order, which a phone offers in the filter popover; null when there is nothing to order. */
  sort: SortOption | null;
  onChange: (changes: Partial<ListState>) => void;
}

/**
 * Search, status and the other filters above the list (direction.md, section 4 "Upphandlingar"): a search field, the
 * status as a segmented control with counts (Öppna by default), "Fler filter" with the source and the buyer, the
 * active ones as chips, and for a company the fit switch. A phone keeps it to a few rows, so rows show on the first
 * screen: the filter popover is an icon by the search and also holds the order.
 */
export function NoticeFilterBar({ state, counts, buyerFilters, fit, sort, onChange }: NoticeFilterBarProps) {
  const isPhone = useIsPhone();
  const moreRef = useRef<HTMLButtonElement>(null);
  const search = <SearchField q={state.q} onCommit={(q) => onChange({ q })} />;
  const status = (
    <StatusControl status={state.status} counts={counts} onChange={(next) => onChange({ status: next })} />
  );
  const more = (
    <MoreFilters state={state} buyerFilters={buyerFilters} sort={sort} triggerRef={moreRef} onChange={onChange} />
  );
  const chips = (
    <FilterChips
      state={state}
      onRemove={(changes) => {
        onChange(changes);
        moreRef.current?.focus();
      }}
    />
  );
  const fitSwitch = fit && (
    <FitSwitch fit={fit} isOn={state.isFitOnly} onChange={(isFitOnly) => onChange({ isFitOnly })} />
  );
  const hasChips = Boolean(state.source || state.buyer);

  if (isPhone) {
    return (
      <VStack gap={3} role="search" aria-label="Sök och filtrera upphandlingar">
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">{search}</StackItem>
          {more}
        </HStack>
        {status}
        {fitSwitch}
        {hasChips && (
          <HStack gap={2} wrap="wrap">
            {chips}
          </HStack>
        )}
      </VStack>
    );
  }
  return (
    <VStack gap={2} role="search" aria-label="Sök och filtrera upphandlingar">
      <HStack gap={3} vAlign="center" wrap="wrap">
        {search}
        {status}
        {more}
        {chips}
      </HStack>
      {fitSwitch}
    </VStack>
  );
}
