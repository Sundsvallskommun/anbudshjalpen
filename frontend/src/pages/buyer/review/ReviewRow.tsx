import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { Citation } from "../../../api/types";
import { SourceLink } from "../../../components/ui/source/SourceLink";
import { citationPage } from "../../../lib/labels";
import { groupInfo, type ReviewRow as Row } from "./rows";
import styles from "./ReviewRow.module.css";

const NAME_MAX = 60;

/** A title short enough for a control's name and tooltip ("Fler val: Anbudet ska vara skrivet på svenska"). */
export function shortTitle(title: string): string {
  const text = title.trim().replace(/\s+/gu, " ");
  return text.length <= NAME_MAX ? text : `${text.slice(0, NAME_MAX - 1).trimEnd()}…`;
}

/**
 * The page of a row's source beside the list, as a link reads it elsewhere: "s. 4", and words only for a deviation
 * ("s. 9 (AI angav 7)", "Hittades inte i underlaget"). Beside the pane the row itself opens the page, so this is text.
 */
function PageLabel({ citation }: { citation: Citation }) {
  const page = citationPage(citation);
  if (citation.check === "moved") return <Token label={`s. ${page} (AI angav ${citation.page})`} color="blue" size="sm" />;
  if (citation.check === "unverified") {
    return <Token label="Hittades inte i underlaget" color="yellow" size="sm" icon={<Icon icon="warning" size="sm" />} />;
  }
  return <Text type="supporting">{`s. ${page}`}</Text>;
}

/** What is said under a row's title: what the checks found, and whether it is changed or its form is open. */
function Hints({ hints, isChanged, isEditing }: { hints: readonly string[]; isChanged: boolean; isEditing: boolean }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {hints.map((hint) => (
        <HStack key={hint} gap={1} vAlign="center">
          <Icon icon="warning" color="warning" size="sm" />
          <Text type="supporting" color="primary">
            {hint}
          </Text>
        </HStack>
      ))}
      {isEditing ? <Token label="Ändras" size="sm" /> : isChanged && <Token label="Ändrad" size="sm" />}
    </HStack>
  );
}

export interface ReviewRowProps {
  row: Row;
  noticeId: string;
  documentId: string;
  /** What the automatic checks say about the row ("Står under 2 Kvalificering"). */
  hints: readonly string[];
  isChanged: boolean;
  isChecked: boolean;
  isSelected: boolean;
  /** Whether the row's form is open beside the list ("Ändras"). */
  isEditing: boolean;
  /** A draft or an approved checklist can be edited; a published or rejected one is read. */
  isEditable: boolean;
  /** Beside the source pane the row opens its page there; without the pane its "s. N" opens the source dialog. */
  hasPane: boolean;
  onSelect: () => void;
  onCheckedChange: (isChecked: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * One row of the checklist under review (direction.md, section 4): "Kontrollerad", the title with what the checks
 * found, the source's page, and "Ändra" and "Ta bort" in a menu. Beside the source pane the whole row is a button
 * that shows its page there.
 */
export function ReviewRow({
  row,
  noticeId,
  documentId,
  hints,
  isChanged,
  isChecked,
  isSelected,
  isEditing,
  isEditable,
  hasPane,
  onSelect,
  onCheckedChange,
  onEdit,
  onRemove,
}: ReviewRowProps) {
  const name = shortTitle(row.title);
  const source = row.citation ? (
    hasPane ? (
      <PageLabel citation={row.citation} />
    ) : (
      <SourceLink
        noticeId={noticeId}
        citation={row.citation}
        claim={row.title}
        origin={groupInfo(row.group).title}
        documentId={documentId}
      />
    )
  ) : null;

  return (
    <Item
      as="li"
      data-row={row.key}
      className={styles.row}
      align="start"
      isSelected={hasPane && isSelected}
      onClick={hasPane ? onSelect : undefined}
      startContent={
        isEditable ? (
          <CheckboxInput
            label={`Kontrollerad: ${name}`}
            isLabelHidden
            value={isChecked}
            onChange={onCheckedChange}
          />
        ) : undefined
      }
      label={<Text>{row.title}</Text>}
      description={
        hints.length > 0 || isChanged || isEditing ? (
          <Hints hints={hints} isChanged={isChanged} isEditing={isEditing} />
        ) : undefined
      }
      endContent={
        <HStack gap={1} vAlign="center">
          {source}
          {isEditable && (
            <MoreMenu
              label={`Fler val: ${name}`}
              size="sm"
              alignment="end"
              items={[
                { label: "Ändra", onClick: onEdit },
                { label: "Ta bort", onClick: onRemove, variant: "destructive" },
              ]}
            />
          )}
        </HStack>
      }
    />
  );
}

/** Rows as a list, edge to edge in the list's surface. */
export function ReviewRowList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // An explicit role, since Safari drops a list's semantics when its bullets are removed.
    <VStack as="ul" role="list" gap={0} aria-label={label}>
      {children}
    </VStack>
  );
}
