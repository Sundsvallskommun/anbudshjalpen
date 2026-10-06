import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useDeleteReminder, useReminders } from "../../api/queries";
import type { ReminderView } from "../../api/types";
import { errorMessage, ErrorNotice, Loading } from "../../components/states";
import { TrashIcon } from "../../components/ui/icons";
import { formatClock, formatShortDate, relativeDays } from "../../lib/format";
import { REMINDER_KIND } from "../../lib/labels";
import { CardHeading } from "./CardHeading";

/** The card shows the next few; "Alla" has the rest. */
const SHOWN = 3;

/** "9 nov kl. 23:59", or "30 okt" for a deadline that is a date. */
function when(value: string): string {
  const clock = formatClock(value);
  return `${formatShortDate(value)}${clock ? ` ${clock}` : ""}`;
}

/** What the reminder is about: "Sista anbudsdag 9 nov kl. 23:59". */
export function reminderAbout(reminder: Pick<ReminderView, "kind" | "deadline_at" | "note">): string {
  if (reminder.kind === "egen") return reminder.note ?? REMINDER_KIND.egen;
  const kind = REMINDER_KIND[reminder.kind];
  return reminder.deadline_at ? `${kind} ${when(reminder.deadline_at)}` : kind;
}

/** When it is mailed, as a fact of its own: "Mejlas 7 nov kl. 08:00 · skickas om 33 dagar". */
export function reminderSending(reminder: Pick<ReminderView, "due_at">): string {
  return `Mejlas ${when(reminder.due_at)} · skickas ${relativeDays(reminder.due_at)}`;
}

function ReminderItem({ reminder, onRemove }: { reminder: ReminderView; onRemove: () => void }) {
  return (
    <VStack as="li" gap={1}>
      <HStack gap={2} vAlign="start">
        <StackItem size="fill">
          <Link href={`/upphandlingar/${reminder.notice_id}`} isStandalone weight="semibold">
            {reminder.notice_title}
          </Link>
        </StackItem>
        <IconButton
          label={`Ta bort påminnelsen om ${reminder.notice_title}`}
          tooltip="Ta bort påminnelsen"
          icon={<Icon icon={TrashIcon} />}
          variant="ghost"
          size="sm"
          onClick={onRemove}
        />
      </HStack>
      <Text type="supporting" color="primary">
        {reminderAbout(reminder)}
      </Text>
      <Text type="supporting">{reminderSending(reminder)}</Text>
    </VStack>
  );
}

/**
 * "Dina påminnelser" (direction.md, section 4 "Start"): the reminders still to be mailed, each with the deadline it
 * is about and when it is sent as two facts, and where the mail goes. Removing one asks first, as it cannot be undone.
 */
export function RemindersCard({ email }: { email: string }) {
  const reminders = useReminders();
  const remove = useDeleteReminder();
  const [pending, setPending] = useState<ReminderView | null>(null);
  const coming = (reminders.data ?? [])
    .filter((reminder) => !reminder.sent_at)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));

  const close = () => {
    setPending(null);
    remove.reset();
  };

  return (
    <Card>
      <VStack as="section" aria-labelledby="paminnelser-kort" gap={3}>
        <HStack gap={3} vAlign="center" hAlign="between">
          <CardHeading id="paminnelser-kort">Dina påminnelser</CardHeading>
          <Link href="/paminnelser" isStandalone weight="medium">
            Alla <VisuallyHidden>påminnelser</VisuallyHidden>
          </Link>
        </HStack>
        {reminders.isPending && <Loading label="Hämtar påminnelser …" />}
        {reminders.isError && (
          <ErrorNotice
            title="Påminnelserna kunde inte hämtas"
            error={reminders.error}
            onRetry={() => reminders.refetch()}
          />
        )}
        {reminders.isSuccess && coming.length === 0 && (
          <Text as="p">
            Inga påminnelser ännu. Tryck på Påminn mig vid en frist, så mejlar vi dig två dagar innan.
          </Text>
        )}
        {coming.length > 0 && (
          <VStack as="ul" role="list" gap={4}>
            {coming.slice(0, SHOWN).map((reminder) => (
              <ReminderItem key={reminder.id} reminder={reminder} onRemove={() => setPending(reminder)} />
            ))}
          </VStack>
        )}
        <Divider />
        <Text type="supporting">{`Mejlas till ${email}`}</Text>
      </VStack>
      <AlertDialog
        isOpen={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) close();
        }}
        title="Ta bort påminnelsen?"
        description={
          remove.isError
            ? errorMessage(remove.error)
            : `Du får inget mejl om ${pending?.notice_title ?? "upphandlingen"}. Det går inte att ångra.`
        }
        actionLabel="Ta bort"
        cancelLabel="Avbryt"
        isActionLoading={remove.isPending}
        onAction={() => {
          if (pending) remove.mutate(pending.id, { onSuccess: close });
        }}
      />
    </Card>
  );
}
