import { Button } from "@astryxdesign/core/Button";
import { pixel, proportional, Table, type TableColumn, useTableGroupedRows } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import type { SearchableItem } from "@astryxdesign/core/Typeahead";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useId, useMemo, useState } from "react";
import { useIsPhone } from "../../lib/usePhone";
import styles from "./ChosenCodes.module.css";
import { cpvDivision, splitCpvChip } from "./profileDraft";

export interface ChosenCodesProps {
  /** The chosen codes, as the draft holds them ("Målning · 45442100"). */
  codes: readonly SearchableItem[];
  /** Every CPV division by code, for the group headings. */
  divisions: Record<string, string>;
  onRemove: (code: string) => void;
}

interface CodeRow extends Record<string, unknown> {
  code: string;
  label: string;
  division: string;
}

/** The codes in code order with their CPV division, so each division's codes sit together under one group row. */
export function codeRows(codes: readonly SearchableItem[]): CodeRow[] {
  return [...codes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({ ...splitCpvChip(item), division: cpvDivision(item.id) }));
}

function removeColumn(onRemove: (code: string) => void): TableColumn<CodeRow> {
  return {
    key: "remove",
    header: <VisuallyHidden>Åtgärd</VisuallyHidden>,
    width: pixel(112),
    align: "end",
    renderCell: (item) => (
      // The visible word is the children; `label` is the accessible name, which says which code goes.
      <Button label={`Ta bort ${item.label} · ${item.code}`} size="sm" variant="ghost" onClick={() => onRemove(item.code)}>
        Ta bort
      </Button>
    ),
  };
}

function columns(onRemove: (code: string) => void): TableColumn<CodeRow>[] {
  return [
    // Rendered by the table itself, not by renderCell: only then does a cut name show in full on hover.
    { key: "label", header: "Benämning", width: proportional(1, { minWidth: 0 }) },
    { key: "code", header: "CPV-kod", width: pixel(96) },
    removeColumn(onRemove),
  ];
}

/** On a phone a code column leaves the name too little room to wrap by words, so the code stands under the name. */
function phoneColumns(onRemove: (code: string) => void): TableColumn<CodeRow>[] {
  return [
    {
      key: "label",
      header: "Benämning och CPV-kod",
      width: proportional(1, { minWidth: 0 }),
      renderCell: (item) => (
        <VStack gap={0}>
          <Text>{item.label}</Text>
          <Text color="secondary" hasTabularNumbers>
            {item.code}
          </Text>
        </VStack>
      ),
    },
    removeColumn(onRemove),
  ];
}

/**
 * The chosen codes as a table grouped by CPV division (direction.md, principle "dense data = rows"): the name, then
 * the code in a column of its own so codes line up whatever the name's length, and a quiet "Ta bort" at the end.
 * A long name is cut to one line and shown in full on hover, so every row keeps one height. A phone has no hover,
 * so there the name wraps with the code under it. Chips in the search
 * field lost their shape past a handful of codes; rows grouped by area stay readable at twenty.
 */
export function ChosenCodes({ codes, divisions, onRemove }: ChosenCodesProps) {
  const headingId = useId();
  const isPhone = useIsPhone();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const onToggleGroup = useCallback((division: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(division)) next.add(division);
      return next;
    });
  }, []);
  const rows = useMemo(() => codeRows(codes), [codes]);
  const tableColumns = useMemo(() => (isPhone ? phoneColumns : columns)(onRemove), [isPhone, onRemove]);
  const grouped = useTableGroupedRows<CodeRow>({
    data: rows,
    groupBy: (row) => row.division,
    collapsedGroups: collapsed,
    onToggleGroup,
    getRowKey: (row) => row.code,
    renderGroupHeader: (division, count) => (
      <Text weight="semibold">{`${divisions[division] ?? `Område ${division.slice(0, 2)}`} · ${count}`}</Text>
    ),
  });
  if (codes.length === 0) {
    return <Text color="secondary">Inga koder valda ännu. Sök ovan eller tryck Föreslå koder.</Text>;
  }
  return (
    <VStack gap={2} role="group" aria-labelledby={headingId} className={styles.codes}>
      <Text id={headingId} weight="semibold">
        {`Era koder · ${codes.length}`}
      </Text>
      <Table
        data={grouped.data}
        columns={tableColumns}
        idKey={grouped.idKey}
        plugins={{ grouped: grouped.plugin }}
        density="compact"
        textOverflow={isPhone ? "wrap" : "truncate"}
      />
    </VStack>
  );
}
