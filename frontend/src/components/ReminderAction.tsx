import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useLocation } from "react-router";
import { useCreateReminder, useSession } from "../api/queries";
import type { IsoDate, ReminderKind } from "../api/types";
import { formatCalendarDate, formatDateTime, swedishToday } from "../lib/format";
import { errorMessage } from "./states";

/**
 * "Påminn mig" for a notice's deadline. The backend derives the time from the deadline it knows (two days
 * before, at 08:00) and e-mails the reminder; `deadline` must be that same date, so the button names the
 * date the reminder is really for. Companies only; others are told how to get one. Nothing is offered for
 * a deadline that has passed, since the backend refuses it.
 */
export function ReminderAction({
  noticeId,
  kind,
  deadline,
  subject,
}: {
  noticeId: string;
  kind: Exclude<ReminderKind, "egen">;
  /** The calendar date the backend reminds about ("YYYY-MM-DD"). */
  deadline: IsoDate;
  /** What the date is, when the surrounding text does not say it ("sista anbudsdag", "frågestoppet"). */
  subject?: string;
}) {
  const session = useSession();
  const create = useCreateReminder(noticeId);
  const { pathname, search } = useLocation();
  const user = session.data?.user;

  if (deadline < swedishToday() || user?.role === "inkopare") return null;
  if (!user) {
    return (
      <Link href={`/logga-in?till=${encodeURIComponent(pathname + search)}`} isStandalone>
        Logga in som företagare för att skapa en påminnelse
      </Link>
    );
  }
  if (create.isSuccess) {
    return (
      <HStack gap={1} vAlign="center" role="status">
        <Icon icon="success" color="success" size="sm" />
        <Text>Påminnelse skapad till {formatDateTime(create.data.due_at)}. Den skickas med e-post.</Text>
      </HStack>
    );
  }
  const label = `Påminn mig före ${subject ? `${subject} ` : ""}${formatCalendarDate(deadline)}`;
  return (
    <VStack gap={1} hAlign="start">
      <Button
        label={label}
        size="sm"
        icon={<Icon icon="calendar" />}
        isLoading={create.isPending}
        onClick={() => create.mutate({ kind })}
      />
      {create.isError && (
        <HStack gap={1} vAlign="center" role="alert">
          <Icon icon="warning" color="warning" size="sm" />
          <Text>{errorMessage(create.error)}</Text>
        </HStack>
      )}
    </VStack>
  );
}
