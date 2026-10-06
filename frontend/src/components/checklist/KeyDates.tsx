import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { Checklist, IsoDate } from "../../api/types";
import { formatLongDate, formatShortDate, isPassed } from "../../lib/format";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { ReminderState } from "../ui/ReminderState";
import { SourceLink } from "../ui/source/SourceLink";
import { dateGroups, type DateRow } from "./checklistModel";
import { dateColumnClass, nestedClass, SectionRow, SectionRows, SectionSubheading } from "./SectionRow";

/** The anchor of the dates section, for the outline. */
export const KEY_DATES_ID = "viktiga-datum";
export const KEY_DATES_TITLE = "Viktiga datum";

const REMINDER_SUBJECT = { fragestopp: "sista dag för frågor", sista_anbudsdag: "sista anbudsdag" } as const;

/** "17 maj – 25 jun 2027" shown, "17 maj 2027 till 25 juni 2027" read. */
function rowDate(row: DateRow): { shown: string; spoken: string } {
  if (!row.from) return { shown: "–", spoken: "Utan datum" };
  if (!row.to) return { shown: formatShortDate(row.from), spoken: formatLongDate(row.from) };
  const sameYear = row.from.slice(0, 4) === row.to.slice(0, 4);
  return {
    shown: `${formatShortDate(row.from, sameYear ? "never" : "auto")} – ${formatShortDate(row.to)}`,
    spoken: `${formatLongDate(row.from)} till ${formatLongDate(row.to)}`,
  };
}

function DateCell({ row, isPast }: { row: DateRow; isPast: boolean }) {
  const { shown, spoken } = rowDate(row);
  return (
    <VStack className={dateColumnClass}>
      <Text weight="semibold" color={isPast ? "secondary" : "primary"} hasTabularNumbers aria-hidden="true">
        {shown}
      </Text>
      <VisuallyHidden>{spoken}</VisuallyHidden>
    </VStack>
  );
}

function KeyDateRow({
  row,
  noticeId,
  documentId,
  canRemind,
  isFlush,
}: {
  row: DateRow;
  noticeId: string;
  documentId?: string;
  canRemind: boolean;
  isFlush?: boolean;
}) {
  const last = row.to ?? row.from;
  const isPast = last !== null && isPassed(last);
  const remindAbout: IsoDate | null = canRemind && row.reminder && row.from ? row.from : null;
  return (
    <SectionRow
      isFlush={isFlush}
      startContent={<DateCell row={row} isPast={isPast} />}
      label={
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text weight={row.reminder ? "semibold" : undefined} color={isPast ? "secondary" : undefined}>
            {row.text}
          </Text>
          {isPast && (
            <HStack gap={1} vAlign="center">
              <Icon icon="clock" size="sm" color="secondary" />
              <Text type="supporting">passerat</Text>
            </HStack>
          )}
          {remindAbout && row.reminder && (
            <ReminderState noticeId={noticeId} kind={row.reminder} deadline={remindAbout} subject={REMINDER_SUBJECT[row.reminder]} />
          )}
        </HStack>
      }
      description={row.detail ?? undefined}
      endContent={
        <SourceLink
          noticeId={noticeId}
          citation={row.citation}
          claim={row.from ? `${row.text}, ${rowDate(row).spoken}` : row.text}
          origin={KEY_DATES_TITLE}
          documentId={documentId}
        />
      }
    />
  );
}

/**
 * The checklist's key dates, split at sista anbudsdag (`deadline`): "Före anbudet" open, in date order, with passed
 * rows in grey; "Efter anbudet och under uppdraget" closed below. A period is one row ("17 maj – 25 jun 2027"). The
 * rows the backend reminds about offer "Påminn mig" when `canRemind` (an open notice with a published checklist).
 */
export function KeyDates({
  checklist,
  deadline,
  noticeId,
  documentId,
  canRemind,
}: {
  checklist: Checklist;
  deadline: IsoDate | null;
  noticeId: string;
  documentId?: string;
  canRemind: boolean;
}) {
  if (checklist.dates.length === 0) return null;
  const { before, after } = dateGroups(checklist, deadline);
  const rowProps = { noticeId, documentId, canRemind };
  return (
    <CollapsibleSection id={KEY_DATES_ID} title={KEY_DATES_TITLE} defaultOpen value={KEY_DATES_ID}>
      {before.length > 0 && (
        <>
          {deadline && <SectionSubheading>Före anbudet</SectionSubheading>}
          <SectionRows label={deadline ? "Före anbudet" : KEY_DATES_TITLE}>
            {before.map((row) => (
              <KeyDateRow key={row.key} row={row} {...rowProps} />
            ))}
          </SectionRows>
        </>
      )}
      {after.length > 0 && (
        <VStack className={nestedClass}>
          <Collapsible
            trigger={<Text weight="medium">{`Efter anbudet och under uppdraget (${after.length})`}</Text>}
            defaultIsOpen={false}
            chevronPosition="start"
          >
            <SectionRows label="Efter anbudet och under uppdraget">
              {after.map((row) => (
                <KeyDateRow key={row.key} row={row} isFlush {...rowProps} />
              ))}
            </SectionRows>
          </Collapsible>
        </VStack>
      )}
    </CollapsibleSection>
  );
}
