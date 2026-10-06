import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useCreateReminder, useReminders, useSession } from "../../api/queries";
import type { IsoDate, ReminderKind, ReminderView } from "../../api/types";
import {
  calendarDateOf,
  daysInWords,
  formatClock,
  formatLongDate,
  formatShortDate,
  swedishToday,
} from "../../lib/format";
import { useIsPhone } from "../../lib/usePhone";
import { errorMessage } from "../states";

export type DeadlineReminderKind = Exclude<ReminderKind, "egen">;

export interface ReminderStateProps {
  noticeId: string;
  kind: DeadlineReminderKind;
  /** The calendar date the backend reminds about ("YYYY-MM-DD"), the same date the surrounding text shows. */
  deadline: IsoDate;
  /** What the date is in running text ("sista anbudsdag", "frågestoppet"); names the button for screen readers. */
  subject?: string;
  /**
   * ghost (default): a quiet "Påminn mig" beside a deadline. block: a full-width secondary button, for the phone's
   * "Nästa frist" card where it is the card's action.
   */
  appearance?: "ghost" | "block";
}

function buttonName(subject: string | undefined, deadline: IsoDate): string {
  return `Påminn mig före ${subject ? `${subject} ` : ""}${formatLongDate(deadline)}`;
}

/**
 * "Klart! Du får ett mejl 7 november kl. 08:00, två dagar före sista anbudsdag." The gap is counted from the
 * reminder's own two times, since a reminder made late is mailed at once (`due_at` is then "now"): the deadline the
 * backend follows (`deadline_at`), else the date the button reminded about.
 */
export function reminderConfirmation(
  reminder: Pick<ReminderView, "due_at"> & Partial<Pick<ReminderView, "deadline_at">>,
  deadline: IsoDate,
  subject?: string,
): string {
  const due = calendarDateOf(reminder.due_at);
  const deadlineDate = reminder.deadline_at ? calendarDateOf(reminder.deadline_at) : deadline;
  const clock = formatClock(reminder.due_at);
  const days = Math.round((Date.parse(`${deadlineDate}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
  const when = `${formatLongDate(due, "never")}${clock ? ` ${clock}` : ""}`;
  const before = days > 0 ? `, ${daysInWords(days)} före ${subject ?? "fristen"}` : "";
  return `Klart! Du får ett mejl ${when}${before}.`;
}

/**
 * The reminder as a fact beside the deadline: "Påminnelse mejlas 7 nov · Ändra". A phone says "Påminnelse 7 nov",
 * which fits a column of the two-by-two key facts; screen readers still hear "mejlas".
 */
function ReminderFact({
  reminder,
  subject,
  linkRef,
}: {
  reminder: ReminderView;
  subject?: string;
  linkRef?: React.Ref<HTMLAnchorElement | HTMLButtonElement>;
}) {
  const isPhone = useIsPhone();
  const sent = reminder.sent_at;
  const verb = sent ? "skickad" : "mejlas";
  const date = formatShortDate(sent ?? reminder.due_at);
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <Icon icon="success" color="success" size="sm" />
      {isPhone ? (
        <Text>
          {"Påminnelse "}
          <VisuallyHidden>{`${verb} `}</VisuallyHidden>
          {date}
        </Text>
      ) : (
        <Text>{`Påminnelse ${verb} ${date}`}</Text>
      )}
      <Link href="/paminnelser" ref={linkRef} label={`Ändra påminnelsen${subject ? ` om ${subject}` : ""}`}>
        Ändra
      </Link>
    </HStack>
  );
}

/** A company's reminder for one deadline: the existing one from the reminders list, or a button that creates it. */
function CompanyReminder({ noticeId, kind, deadline, subject, appearance = "ghost" }: ReminderStateProps) {
  const reminders = useReminders();
  const create = useCreateReminder(noticeId);
  const [announcement, setAnnouncement] = useState("");
  const linkRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  const existing =
    create.data ?? reminders.data?.find((reminder) => reminder.notice_id === noticeId && reminder.kind === kind);

  // The button the user pressed is gone once the reminder exists: keep their place on the link that replaces it.
  useEffect(() => {
    if (create.isSuccess) linkRef.current?.focus();
  }, [create.isSuccess]);

  const remind = () =>
    create.mutate(
      { kind },
      { onSuccess: (reminder) => setAnnouncement(reminderConfirmation(reminder, deadline, subject)) },
    );

  return (
    <VStack gap={1} hAlign={appearance === "block" ? "stretch" : "start"}>
      {existing ? (
        <ReminderFact reminder={existing} subject={subject} linkRef={linkRef} />
      ) : (
        <Button
          label={buttonName(subject, deadline)}
          variant={appearance === "block" ? "secondary" : "ghost"}
          size={appearance === "block" ? "md" : "sm"}
          width={appearance === "block" ? "100%" : undefined}
          icon={<Icon icon="calendar" />}
          isLoading={create.isPending}
          onClick={remind}
        >
          Påminn mig
        </Button>
      )}
      {create.isError && (
        <HStack gap={1} vAlign="center" role="alert">
          <Icon icon="warning" color="warning" size="sm" />
          <Text>{errorMessage(create.error)}</Text>
        </HStack>
      )}
      <VisuallyHidden as="div" role="status">
        {announcement}
      </VisuallyHidden>
    </VStack>
  );
}

/**
 * "Påminn mig" beside a deadline, and the same place afterwards: "Påminnelse mejlas 7 nov" with "Ändra". It reads the
 * company's reminders, so it looks the same wherever the deadline is shown. The backend derives the e-mail's time
 * from the deadline it knows (two days before, at 08:00); `deadline` must be that same date. Nothing is offered for
 * a passed deadline (the backend refuses it) or to inköp; a visitor is taken to the login and back.
 */
export function ReminderState({ appearance = "ghost", ...props }: ReminderStateProps) {
  const session = useSession();
  const { pathname, search } = useLocation();
  const user = session.data?.user;

  if (props.deadline < swedishToday() || user?.role === "inkopare" || session.isPending) return null;
  if (!user) {
    return (
      <Button
        label={`${buttonName(props.subject, props.deadline)}, logga in först`}
        variant={appearance === "block" ? "secondary" : "ghost"}
        size={appearance === "block" ? "md" : "sm"}
        width={appearance === "block" ? "100%" : undefined}
        icon={<Icon icon="calendar" />}
        href={`/logga-in?till=${encodeURIComponent(pathname + search)}`}
      >
        Påminn mig
      </Button>
    );
  }
  return <CompanyReminder appearance={appearance} {...props} />;
}
