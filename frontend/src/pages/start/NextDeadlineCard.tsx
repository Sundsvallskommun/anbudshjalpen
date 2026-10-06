import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { AccentCard } from "../../components/ui/AccentCard";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { ReminderState } from "../../components/ui/ReminderState";
import { calendarDateOf, formatClock, formatShortDate, relativeDays } from "../../lib/format";
import { DATE_KIND } from "../../lib/labels";
import { useIsPhone } from "../../lib/usePhone";
import type { DeadlineEntry, NextDeadlines } from "./start";

/** The deadline as running text names it, for the reminder button ("Påminn mig före sista dag för frågor …"). */
const SUBJECT: Record<DeadlineEntry["kind"], string> = {
  fragestopp: "sista dag för frågor",
  sista_anbudsdag: "sista anbudsdag",
};

function DeadlineReminder({ entry, isBlock = false }: { entry: DeadlineEntry; isBlock?: boolean }) {
  return (
    <ReminderState
      noticeId={entry.notice.id}
      kind={entry.kind}
      deadline={calendarDateOf(entry.at)}
      subject={SUBJECT[entry.kind]}
      appearance={isBlock ? "block" : "ghost"}
    />
  );
}

/** "Därefter: Sista anbudsdag 9 nov kl. 23:59 · om 35 dagar", with its own reminder. */
function ThenLine({ entry }: { entry: DeadlineEntry }) {
  const clock = formatClock(entry.at);
  const when = `${formatShortDate(entry.at)}${clock ? ` ${clock}` : ""}`;
  return (
    <>
      <Divider />
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text type="supporting">{`Därefter: ${DATE_KIND[entry.kind]} ${when} · ${relativeDays(entry.at)}`}</Text>
        <DeadlineReminder entry={entry} />
      </HStack>
    </>
  );
}

/**
 * What the deadline is and for which procurement: "Sista dag för frågor · Ommålning av …" on one line, or on a phone
 * two lines without the dot, as a long title would otherwise leave the dot alone at the end of the first.
 */
function DeadlineSubject({ entry }: { entry: DeadlineEntry }) {
  const isPhone = useIsPhone();
  const link = (
    <Link href={`/upphandlingar/${entry.notice.id}`} hasUnderline>
      {entry.notice.title}
    </Link>
  );
  if (isPhone) {
    return (
      <VStack gap={0.5}>
        <Text weight="semibold">{DATE_KIND[entry.kind]}</Text>
        <Text>{link}</Text>
      </VStack>
    );
  }
  return (
    <Text>
      <Text weight="semibold">{DATE_KIND[entry.kind]}</Text>
      <Text color="secondary" aria-hidden="true">
        {" · "}
      </Text>
      {link}
    </Text>
  );
}

/**
 * "Nästa frist" (direction.md, section 4 "Start"): the nearest deadline among the matches, large, with what it is,
 * the procurement and the reminder for it; below, the same procurement's next deadline. It is the one card on Start
 * that says what to do next, so it carries the accent edge. On a phone the reminder is the card's full-width action.
 */
export function NextDeadlineCard({ deadlines }: { deadlines: NextDeadlines }) {
  const isPhone = useIsPhone();
  const { next, then } = deadlines;
  const what = (
    <VStack gap={1}>
      <Heading level={5} accessibilityLevel={2} id="nasta-frist" color="secondary" weight="normal">
        Nästa frist
      </Heading>
      <DeadlineBlock deadline={next.at} />
      <DeadlineSubject entry={next} />
    </VStack>
  );
  return (
    <AccentCard>
      <VStack as="section" aria-labelledby="nasta-frist" gap={3}>
        {isPhone ? (
          <VStack gap={3}>
            {what}
            <DeadlineReminder entry={next} isBlock />
          </VStack>
        ) : (
          <HStack gap={6} vAlign="center" hAlign="between" wrap="wrap">
            {what}
            <DeadlineReminder entry={next} />
          </HStack>
        )}
        {then && !isPhone && <ThenLine entry={then} />}
      </VStack>
    </AccentCard>
  );
}
