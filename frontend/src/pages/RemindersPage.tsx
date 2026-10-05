import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useDeleteReminder, useReminders } from "../api/queries";
import type { ReminderView, UserView } from "../api/types";
import { Row, RowList } from "../components/RowList";
import { errorMessage, ErrorNotice, Loading } from "../components/states";
import { formatDateTime } from "../lib/format";
import { REMINDER_KIND } from "../lib/labels";
import { Page } from "../shell/Page";
import { RequireRole } from "../shell/RequireRole";

function ReminderItem({ reminder, onDelete }: { reminder: ReminderView; onDelete: () => void }) {
  return (
    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
      <VStack gap={1}>
        <Heading level={2}>
          <Link href={`/upphandlingar/${reminder.notice_id}`}>{reminder.notice_title}</Link>
        </Heading>
        <Text>
          <Text weight="semibold">{REMINDER_KIND[reminder.kind]}:</Text> {formatDateTime(reminder.due_at)}
        </Text>
        {reminder.note && <Text color="secondary">{reminder.note}</Text>}
        <HStack gap={2}>
          {reminder.sent_at ? (
            <Token label={`Skickad ${formatDateTime(reminder.sent_at)}`} color="green" icon={<Icon icon="success" size="sm" />} />
          ) : (
            <Token label="Väntar" icon={<Icon icon="clock" size="sm" />} />
          )}
        </HStack>
      </VStack>
      <Button label={`Ta bort påminnelsen för ${reminder.notice_title}`} size="sm" variant="ghost" onClick={onDelete}>
        Ta bort
      </Button>
    </HStack>
  );
}

function Reminders({ user }: { user: UserView }) {
  const reminders = useReminders();
  const remove = useDeleteReminder();
  const [pending, setPending] = useState<ReminderView | null>(null);

  if (reminders.isPending) return <Loading label="Hämtar påminnelser …" />;
  if (reminders.isError) {
    return (
      <ErrorNotice title="Påminnelserna kunde inte hämtas" error={reminders.error} onRetry={() => reminders.refetch()} />
    );
  }
  const sorted = [...reminders.data].sort((a, b) => a.due_at.localeCompare(b.due_at));
  return (
    <VStack gap={4}>
      <Text color="secondary">{`Påminnelser skickas med e-post till ${user.email}.`}</Text>
      {sorted.length === 0 ? (
        <EmptyState
          headingLevel={2}
          title="Inga påminnelser"
          description="Skapa en påminnelse från en upphandlings viktiga datum, eller när Anbudsklar föreslår att du ställer en fråga i e-Avrop."
          actions={<Button label="Se upphandlingar" href="/" />}
        />
      ) : (
        <RowList label="Påminnelser">
          {sorted.map((reminder) => (
            <Row key={reminder.id}>
              <ReminderItem reminder={reminder} onDelete={() => setPending(reminder)} />
            </Row>
          ))}
        </RowList>
      )}
      <AlertDialog
        isOpen={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPending(null);
        }}
        title="Ta bort påminnelsen?"
        description={
          remove.isError
            ? errorMessage(remove.error)
            : `Du får ingen påminnelse om ${pending?.notice_title ?? "upphandlingen"}.`
        }
        actionLabel="Ta bort"
        cancelLabel="Avbryt"
        isActionLoading={remove.isPending}
        onAction={() => {
          if (pending) remove.mutate(pending.id, { onSuccess: () => setPending(null) });
        }}
      />
    </VStack>
  );
}

export default function RemindersPage() {
  return (
    <RequireRole role="foretagare" title="Påminnelser">
      {(user) => (
        <Page title="Påminnelser" width={760} intro="Frister du vill bli påmind om, till exempel sista dag för frågor.">
          <Reminders user={user} />
        </Page>
      )}
    </RequireRole>
  );
}
