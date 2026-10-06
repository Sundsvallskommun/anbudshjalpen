import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReminderView } from "../../api/types";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { TrashIcon } from "../../components/ui/icons";
import { REMINDER_KIND } from "../../lib/labels";
import { DEADLINE_SUBJECT, mailTime, sendState } from "./reminderFacts";

/** "sista anbudsdag för Ommålning av …": which reminder a control acts on, for its name. */
export function reminderSubject(reminder: Pick<ReminderView, "kind" | "notice_title">): string {
  return reminder.kind === "egen"
    ? reminder.notice_title
    : `${DEADLINE_SUBJECT[reminder.kind]} för ${reminder.notice_title}`;
}

/** The first fact: the deadline the reminder is about, as the fristblock every page uses. */
function DeadlineFact({ reminder }: { reminder: ReminderView }) {
  if (reminder.kind === "egen") {
    return (
      <VStack gap={0.5}>
        <Text type="supporting">{REMINDER_KIND.egen}</Text>
        {reminder.note && <Text>{reminder.note}</Text>}
      </VStack>
    );
  }
  if (reminder.deadline_at) {
    return <DeadlineBlock deadline={reminder.deadline_at} label={REMINDER_KIND[reminder.kind]} />;
  }
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{REMINDER_KIND[reminder.kind]}</Text>
      <Text color="secondary">Datumet finns inte i upphandlingen just nu</Text>
    </VStack>
  );
}

/**
 * The second fact: when the e-mail goes and how soon ("Mejlas fredag 7 november kl. 08:00 · om 33 dagar", built like
 * the deadline beside it), or that it went, as a status. Never labelled as the deadline (direction.md, 9.2).
 */
function MailFact({ reminder }: { reminder: ReminderView }) {
  const state = sendState(reminder);
  if (state.isSent) {
    return (
      <VStack gap={0.5} hAlign="start">
        <Text type="supporting">Mejlet</Text>
        <Token label={state.label} color="green" size="sm" icon={<Icon icon="success" size="sm" />} />
      </VStack>
    );
  }
  return (
    <VStack gap={0.5}>
      <Text type="supporting">Mejlas</Text>
      <Text>{mailTime(reminder.due_at)}</Text>
      <Text type="supporting">{state.label}</Text>
    </VStack>
  );
}

/**
 * One reminder as a card (direction.md, section 4 "Påminnelser"): the notice as a link with "Ta bort" on the title
 * row, then the deadline and the e-mail as two facts side by side.
 */
export function ReminderCard({ reminder, onRemove }: { reminder: ReminderView; onRemove: (reminder: ReminderView) => void }) {
  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} hAlign="between" vAlign="start">
          {/* The title takes what the button leaves; the button keeps its size, so "Ta bort" stays on one line. */}
          <StackItem size="fill">
            <Heading level={4} accessibilityLevel={3}>
              <Link href={`/upphandlingar/${reminder.notice_id}`} weight="semibold">
                {reminder.notice_title}
              </Link>
            </Heading>
          </StackItem>
          <StackItem>
            <Button
              label={`Ta bort påminnelsen om ${reminderSubject(reminder)}`}
              variant="ghost"
              size="sm"
              icon={<Icon icon={TrashIcon} size="sm" />}
              onClick={() => onRemove(reminder)}
            >
              Ta bort
            </Button>
          </StackItem>
        </HStack>
        {/* Two columns, the same in every card, so the facts line up down the list, on a phone too. */}
        <Grid columns={{ minWidth: 140, max: 2 }} columnGap={6} rowGap={4} align="start">
          <DeadlineFact reminder={reminder} />
          <MailFact reminder={reminder} />
        </Grid>
        {reminder.kind !== "egen" && reminder.note && <Text color="secondary">{reminder.note}</Text>}
      </VStack>
    </Card>
  );
}
