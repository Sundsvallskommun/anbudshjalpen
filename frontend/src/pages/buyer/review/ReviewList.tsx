import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { PublishedAnswerView } from "../../../api/types";
import { formatNumber, plural } from "../../../lib/format";
import { ViewSwitch } from "../ViewSwitch";
import type { SummaryIssue } from "./checks";
import { ReviewRow, ReviewRowList } from "./ReviewRow";
import { groupedRows, type ReviewRow as Row, type RowSection } from "./rows";
import styles from "./ReviewList.module.css";

/** The list's filters (direction.md, section 4): all rows, those to check, those changed here, those checked. */
export type RowFilter = "alla" | "kontroll" | "andrade" | "klara";

/** A row with what the page knows about it. */
export interface RowState {
  row: Row;
  hints: readonly string[];
  needsCheck: boolean;
  isChanged: boolean;
  isChecked: boolean;
}

export function isInFilter(state: RowState, filter: RowFilter): boolean {
  if (filter === "kontroll") return state.needsCheck;
  if (filter === "andrade") return state.isChanged;
  if (filter === "klara") return state.isChecked;
  return true;
}

const ADDABLE: readonly RowSection[] = ["requirement", "date", "attachment", "evaluation", "term", "question"];
const ADD_LABEL: Record<RowSection, string> = {
  requirement: "Krav",
  date: "Datum",
  attachment: "Bilaga",
  evaluation: "Utvärderingskriterium",
  term: "Ord eller begrepp",
  question: "Oklarhet",
};

export function ListToolbar({
  filter,
  onFilterChange,
  states,
  isEditable,
  onAdd,
}: {
  filter: RowFilter;
  onFilterChange: (filter: RowFilter) => void;
  states: readonly RowState[];
  isEditable: boolean;
  onAdd: (section: RowSection) => void;
}) {
  const count = (which: RowFilter) => formatNumber(states.filter((state) => isInFilter(state, which)).length);
  const filters: { value: RowFilter; label: string }[] = [
    { value: "alla", label: `Alla (${count("alla")})` },
    { value: "kontroll", label: `Flaggade (${count("kontroll")})` },
    ...(isEditable
      ? [
          { value: "andrade" as const, label: `Ändrade (${count("andrade")})` },
          { value: "klara" as const, label: `Kontrollerade (${count("klara")})` },
        ]
      : []),
  ];
  return (
    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap" className={styles.toolbar}>
      <ViewSwitch label="Visa rader" value={filter} onChange={onFilterChange} options={filters} size="sm" />
      {isEditable && (
        <DropdownMenu
          button={{ label: "Lägg till", size: "sm" }}
          alignment="end"
          items={ADDABLE.map((section) => ({ label: ADD_LABEL[section], onClick: () => onAdd(section) }))}
        />
      )}
    </HStack>
  );
}

/** A group's heading on its band; beside the source pane it stays at the top of the list while its rows scroll. */
function GroupHead({ isSticky, children }: { isSticky: boolean; children: React.ReactNode }) {
  return (
    <HStack gap={2} vAlign="center" className={isSticky ? `${styles.groupHead} ${styles.sticky}` : styles.groupHead}>
      {children}
    </HStack>
  );
}

/**
 * "Sammanfattning för företagen": what companies read first, in full, with a word for what is wrong with it (the
 * check above says it in a sentence, which screen readers also hear on the word) and "Ändra".
 */
export function SummaryBlock({
  summary,
  issue,
  isEditable,
  hasPane,
  onEdit,
}: {
  summary: string;
  issue: SummaryIssue | null;
  isEditable: boolean;
  hasPane: boolean;
  onEdit: () => void;
}) {
  return (
    <VStack as="section" aria-labelledby="granskning-sammanfattning" gap={0}>
      <GroupHead isSticky={hasPane}>
        <Heading level={3} id="granskning-sammanfattning">
          Sammanfattning för företagen
        </Heading>
      </GroupHead>
      <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap" className={styles.summary}>
        <Text as="p" className={styles.summaryText}>
          {summary.trim() || "Ingen sammanfattning ännu."}
        </Text>
        {(issue || isEditable) && (
          <HStack gap={2} vAlign="center">
            {issue && (
              <Token
                label={issue.label}
                description={issue.text}
                color="yellow"
                size="sm"
                icon={<Icon icon="warning" size="sm" />}
              />
            )}
            {isEditable && (
              <Button label="Ändra sammanfattningen" size="sm" variant="ghost" onClick={onEdit}>
                Ändra
              </Button>
            )}
          </HStack>
        )}
      </HStack>
    </VStack>
  );
}

export interface ListGroupsProps {
  states: readonly RowState[];
  filter: RowFilter;
  noticeId: string;
  documentId: string;
  /** Inköp's published answers, so a requirement that quotes one names it by its number on the page (decision 0018). */
  publishedAnswers?: readonly PublishedAnswerView[];
  selectedKey: string | null;
  /** The row whose form is open beside the list. */
  editingKey: string | null;
  isEditable: boolean;
  hasPane: boolean;
  onSelect: (row: Row) => void;
  onCheckedChange: (row: Row, isChecked: boolean) => void;
  onEdit: (row: Row) => void;
  onRemove: (row: Row) => void;
}

/** The rows the filter lets through, by group: the four kinds of requirement, then dates, attachments and the rest. */
export function ListGroups({
  states,
  filter,
  selectedKey,
  editingKey,
  onSelect,
  onCheckedChange,
  onEdit,
  onRemove,
  ...row
}: ListGroupsProps) {
  const shown = states.filter((state) => isInFilter(state, filter));
  if (shown.length === 0) {
    return (
      <Text as="p" color="secondary" className={styles.empty}>
        Inga rader i det här urvalet.
      </Text>
    );
  }
  const byKey = new Map(shown.map((state) => [state.row.key, state]));
  return groupedRows(shown.map((state) => state.row)).map(({ group, rows }) => {
    const headingId = `granskning-${group.id}`;
    return (
      <VStack key={group.id} as="section" aria-labelledby={headingId} gap={0}>
        <GroupHead isSticky={row.hasPane}>
          <Heading level={3} id={headingId}>
            {group.title}
            <VisuallyHidden>{`, ${plural(rows.length, group.countNoun[0], group.countNoun[1])}`}</VisuallyHidden>
          </Heading>
          <Text type="inherit" aria-hidden="true">
            <Badge label={String(rows.length)} />
          </Text>
        </GroupHead>
        <ReviewRowList label={group.title}>
          {rows.map((current) => {
            const state = byKey.get(current.key)!;
            return (
              <ReviewRow
                key={current.key}
                row={current}
                hints={state.hints}
                isChanged={state.isChanged}
                isChecked={state.isChecked}
                isSelected={current.key === selectedKey}
                isEditing={current.key === editingKey}
                onSelect={() => onSelect(current)}
                onCheckedChange={(isChecked) => onCheckedChange(current, isChecked)}
                onEdit={() => onEdit(current)}
                onRemove={() => onRemove(current)}
                {...row}
              />
            );
          })}
        </ReviewRowList>
      </VStack>
    );
  });
}
