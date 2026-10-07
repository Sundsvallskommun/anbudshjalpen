import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import type { NoticeDetail } from "../../../api/types";
import { TermText } from "../../../components/TermText";
import { DeadlineBlock } from "../../../components/ui/DeadlineBlock";
import { ReminderState } from "../../../components/ui/ReminderState";
import { formatSek } from "../../../lib/format";
import { noticeDeadlineReminder, REMINDER_KIND, REMINDER_SUBJECT } from "../../../lib/labels";
import { useIsPhone } from "../../../lib/usePhone";
import { procedureFact, questionDeadlineDate, reminderDeadline } from "../noticeData";

/** One key fact and what can be done about it, below it ("Påminn mig"). */
function Fact({ children, action, isDense }: { children: ReactNode; action?: ReactNode; isDense: boolean }) {
  return (
    <VStack gap={isDense ? 1 : 2} hAlign="start">
      {children}
      {action}
    </VStack>
  );
}

/**
 * A fact that is not a deadline, in the deadline block's rhythm (label, value, one line below), so the four columns'
 * labels, values and second lines stand on the same lines.
 */
function FactValue({ label, children, detail }: { label: string; children: ReactNode; detail?: string | null }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      {children}
      {detail && <Text type="supporting">{detail}</Text>}
    </VStack>
  );
}

/** The line box of a large value (a date, an amount): the size the deadline block gives its date, at body leading. */
const LARGE_VALUE_LINE = "calc(var(--font-size-xl) * var(--text-body-leading))";

/** A value in body text centred on the large values' line beside it, so the lines below them stay level. */
function OnValueLine({ children }: { children: ReactNode }) {
  return (
    <VStack minHeight={LARGE_VALUE_LINE} vAlign="center">
      {children}
    </VStack>
  );
}

/**
 * The four facts a supplier decides on (direction.md, section 4 "sidhuvud"): sista anbudsdag (or, in a restricted
 * procedure, sista dag för anbudsansökan) and sista dag för frågor
 * as deadline blocks with their reminders, the estimated value with the place, and the procedure in plain words with
 * its term explained. Four columns on a card; two by two on a phone, without the place and the law, so the steps
 * start on the first screen (both are under "Om upphandlingen").
 */
export function KeyFacts({ notice }: { notice: NoticeDetail }) {
  const isPhone = useIsPhone();
  const year = isPhone ? "auto" : "always";
  const isOpen = notice.status === "open";
  // The notice's own deadline: sista anbudsdag, or in a restricted procedure the last day for anbudsansökan.
  const deadlineKind = noticeDeadlineReminder(notice);
  const deadlineReminder = isOpen ? reminderDeadline(notice, deadlineKind) : null;
  const questionDate = questionDeadlineDate(notice);
  const procedure = procedureFact(notice.procedure);
  const value = notice.estimated_value_sek;

  const facts: ReactNode[] = [];
  if (notice.deadline_at) {
    facts.push(
      <Fact
        key="anbud"
        isDense={isPhone}
        action={
          deadlineReminder ? (
            <ReminderState
              noticeId={notice.id}
              kind={deadlineKind}
              deadline={deadlineReminder}
              subject={REMINDER_SUBJECT[deadlineKind]}
            />
          ) : undefined
        }
      >
        <DeadlineBlock deadline={notice.deadline_at} label={REMINDER_KIND[deadlineKind]} year={year} />
      </Fact>,
    );
  }
  if (notice.question_deadline && questionDate) {
    facts.push(
      <Fact
        key="fragor"
        isDense={isPhone}
        action={
          isOpen ? (
            <ReminderState noticeId={notice.id} kind="fragestopp" deadline={questionDate} subject="sista dag för frågor" />
          ) : undefined
        }
      >
        <DeadlineBlock deadline={notice.question_deadline} label={isPhone ? "Frågor senast" : "Sista dag för frågor"} year={year} />
      </Fact>,
    );
  }
  if (value !== null) {
    facts.push(
      <Fact key="varde" isDense={isPhone}>
        <FactValue label={isPhone ? "Värde" : "Uppskattat värde"} detail={isPhone ? null : notice.place}>
          <Text size="xl" weight="semibold" hasTabularNumbers>
            {formatSek(value)}
          </Text>
        </FactValue>
      </Fact>,
    );
  } else if (notice.place) {
    facts.push(
      <Fact key="plats" isDense={isPhone}>
        <FactValue label="Plats">
          <OnValueLine>
            <Text weight="semibold">{notice.place}</Text>
          </OnValueLine>
        </FactValue>
      </Fact>,
    );
  }
  if (procedure) {
    facts.push(
      <Fact key="forfarande" isDense={isPhone}>
        <FactValue label="Förfarande" detail={isPhone ? null : procedure.detail}>
          <OnValueLine>
            <TermText text={procedure.label} />
          </OnValueLine>
        </FactValue>
      </Fact>,
    );
  }
  if (facts.length === 0) return null;

  return (
    <VStack as="section" aria-label="Nyckeltal">
      <Card>
        <Grid columns={{ minWidth: 140, max: 4, repeat: "fit" }} gap={isPhone ? 3 : 4}>
          {facts}
        </Grid>
      </Card>
    </VStack>
  );
}
