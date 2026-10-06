import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useId, useRef, useState } from "react";
import { useDeleteReminder, useMatches, useReminders } from "../api/queries";
import type { ReminderView, UserView } from "../api/types";
import { errorMessage, ErrorNotice, Loading } from "../components/states";
import { Page } from "../shell/Page";
import { RequireRole } from "../shell/RequireRole";
import { ReminderCard, reminderSubject } from "./reminders/ReminderCard";
import { deadlineSuggestions, splitReminders } from "./reminders/reminderFacts";
import { ReminderSuggestions } from "./reminders/ReminderSuggestions";

type SectionKey = "upcoming" | "sent";

function ReminderSection({
  title,
  reminders,
  onRemove,
  headingRef,
}: {
  title: string;
  reminders: readonly ReminderView[];
  onRemove: (reminder: ReminderView) => void;
  headingRef: (element: HTMLHeadingElement | null) => void;
}) {
  const headingId = useId();
  return (
    <VStack as="section" gap={3} aria-labelledby={headingId}>
      <Heading level={3} accessibilityLevel={2} id={headingId} ref={headingRef} tabIndex={-1}>
        {title}
      </Heading>
      <VStack as="ul" role="list" gap={3}>
        {reminders.map((reminder) => (
          <li key={reminder.id}>
            <ReminderCard reminder={reminder} onRemove={onRemove} />
          </li>
        ))}
      </VStack>
    </VStack>
  );
}

/**
 * The deadlines to suggest once the page has been empty, kept while the user sets reminders from them. Not ready
 * until the matches are known, so an empty page does not flash its plain empty state before the suggestions.
 */
function useSuggestions(isEmpty: boolean) {
  const matches = useMatches();
  const [wasEmpty, setWasEmpty] = useState(false);
  useEffect(() => {
    if (isEmpty) setWasEmpty(true);
  }, [isEmpty]);
  if (!(isEmpty || wasEmpty)) return { suggestions: [], isReady: true };
  return { suggestions: matches.data ? deadlineSuggestions(matches.data) : [], isReady: !matches.isPending };
}

/**
 * Where focus goes once a removed reminder has left the list: its section's heading, else the other section's,
 * else the page's own, so a keyboard user is never left on a control that no longer exists.
 */
function useFocusAfterRemoval(reminders: readonly ReminderView[] | undefined) {
  const headings = useRef(new Map<SectionKey, HTMLHeadingElement>());
  const [removed, setRemoved] = useState<{ id: string; section: SectionKey } | null>(null);

  useEffect(() => {
    if (!removed || !reminders || reminders.some((reminder) => reminder.id === removed.id)) return;
    const target =
      headings.current.get(removed.section) ??
      headings.current.get(removed.section === "upcoming" ? "sent" : "upcoming") ??
      document.querySelector<HTMLElement>("[data-page-heading]");
    target?.focus();
    setRemoved(null);
  }, [removed, reminders]);

  const headingRef = (key: SectionKey) => (element: HTMLHeadingElement | null) => {
    if (element) headings.current.set(key, element);
    else headings.current.delete(key);
  };
  return { headingRef, setRemoved };
}

function Reminders({ user }: { user: UserView }) {
  const reminders = useReminders();
  const remove = useDeleteReminder();
  const [pending, setPending] = useState<ReminderView | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { headingRef, setRemoved } = useFocusAfterRemoval(reminders.data);
  const isEmpty = reminders.data?.length === 0;
  const { suggestions, isReady } = useSuggestions(isEmpty);

  if (reminders.isPending) return <Loading label="Hämtar påminnelser …" />;
  if (reminders.isError) {
    return <ErrorNotice title="Påminnelserna kunde inte hämtas" error={reminders.error} onRetry={() => reminders.refetch()} />;
  }

  const { upcoming, sent } = splitReminders(reminders.data);
  const confirmRemoval = () => {
    if (!pending) return;
    const section: SectionKey = pending.sent_at ? "sent" : "upcoming";
    const subject = reminderSubject(pending);
    remove.mutate(pending.id, {
      onSuccess: () => {
        setRemoved({ id: pending.id, section });
        setPending(null);
        setAnnouncement(`Påminnelsen om ${subject} är borttagen.`);
      },
    });
  };

  return (
    <VStack gap={8}>
      {isEmpty && isReady && suggestions.length === 0 && (
        <Card>
          <EmptyState
            headingLevel={2}
            title="Inga påminnelser ännu"
            description="Lägg till en påminnelse vid en frist, så får du ett mejl i god tid före den."
            actions={<Button label="Se upphandlingar" href="/upphandlingar" />}
          />
        </Card>
      )}
      {upcoming.length > 0 && (
        <ReminderSection title="Kommande" reminders={upcoming} onRemove={setPending} headingRef={headingRef("upcoming")} />
      )}
      {sent.length > 0 && (
        <ReminderSection title="Skickade" reminders={sent} onRemove={setPending} headingRef={headingRef("sent")} />
      )}
      {suggestions.length > 0 && <ReminderSuggestions suggestions={suggestions} isEmpty={isEmpty} />}
      <Text type="supporting">
        {`Påminnelserna mejlas till ${user.email}. Ändras en frist, till exempel när inköp publicerar checklistan, flyttas påminnelsen med.`}
      </Text>
      <AlertDialog
        isOpen={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPending(null);
            remove.reset();
          }
        }}
        title="Ta bort påminnelsen?"
        description={
          remove.isError
            ? errorMessage(remove.error)
            : `Du får inget mejl om ${pending ? reminderSubject(pending) : "fristen"}.`
        }
        actionLabel="Ta bort"
        cancelLabel="Avbryt"
        isActionLoading={remove.isPending}
        onAction={confirmRemoval}
      />
      <VisuallyHidden as="div" role="status">
        {announcement}
      </VisuallyHidden>
    </VStack>
  );
}

/**
 * Påminnelser (direction.md, section 4): what is coming and what has been sent, each reminder a card with the
 * deadline and the e-mail as two facts. Reached from the account menu and from the reminder e-mails.
 */
export default function RemindersPage() {
  return (
    <RequireRole role="foretagare" title="Påminnelser">
      {(user) => (
        <Page
          title="Påminnelser"
          width={760}
          intro="Du får ett mejl före fristerna du har valt, så att du hinner ställa frågor och lämna anbud i tid."
        >
          <Reminders user={user} />
        </Page>
      )}
    </RequireRole>
  );
}
