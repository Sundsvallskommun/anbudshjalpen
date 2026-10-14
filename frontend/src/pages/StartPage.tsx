import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRef, useState } from "react";
import { useMatches, useMatchingStatus } from "../api/queries";
import type { UserView } from "../api/types";
import { plural, relativeDays } from "../lib/format";
import { useIsPhone } from "../lib/usePhone";
import { Page } from "../shell/Page";
import { RequireRole } from "../shell/RequireRole";
import { MatchesSection } from "./start/MatchesSection";
import { NextDeadlineCard } from "./start/NextDeadlineCard";
import { ProfileCard } from "./start/ProfileCard";
import { RemindersCard } from "./start/RemindersCard";
import { RulesCard } from "./start/RulesCard";
import { firstName, isFitting, nextDeadlines, sortMatches } from "./start/start";
import { UpcomingSection } from "./start/UpcomingSection";
import { useMatchDismissal } from "./start/useMatchDismissal";

/**
 * "Målerifirman i Matfors AB · 2 nya träffar · nästa frist om 25 dagar"; a phone leaves out the company. While the
 * engine is still assessing a just-saved profile, no count is final: "träffarna bedöms" instead of "inga nya träffar".
 */
function summaryLine(parts: {
  company: string | null;
  matchCount: number | null;
  isAssessing: boolean;
  nextAt: string | null;
}): string {
  return [
    parts.company,
    parts.matchCount === null
      ? null
      : parts.matchCount === 0
        ? parts.isAssessing
          ? "träffarna bedöms"
          : "inga nya träffar"
        : plural(parts.matchCount, "ny träff", "nya träffar"),
    parts.nextAt ? `nästa frist ${relativeDays(parts.nextAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StartContent({ user }: { user: UserView }) {
  const isPhone = useIsPhone();
  const matches = useMatches();
  const isAssessing = useMatchingStatus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const dismissal = useMatchDismissal({
    onDismissed: () => headingRef.current?.focus(),
    onRestored: (match) => setFocusId(match.id),
  });

  const visible = (matches.data ?? []).filter((match) => !dismissal.hiddenIds.has(match.id));
  const fitting = sortMatches(visible.filter(isFitting));
  const notFitting = sortMatches(visible.filter((match) => !isFitting(match)));
  const deadlines = matches.isSuccess ? nextDeadlines(fitting) : null;

  const nextCard = deadlines ? <NextDeadlineCard deadlines={deadlines} /> : null;
  const matchesSection = (
    <MatchesSection
      query={matches}
      fitting={fitting}
      notFitting={notFitting}
      dismissal={dismissal}
      isAssessing={isAssessing}
      headingRef={headingRef}
      focusId={focusId}
      onFocused={() => setFocusId(null)}
    />
  );
  const reminders = <RemindersCard email={user.email} />;

  return (
    <Page
      title="Start"
      heading={`Välkommen, ${firstName(user.name)}`}
      intro={
        <Text color="secondary">
          {summaryLine({
            company: isPhone ? null : (user.company?.name ?? null),
            matchCount: matches.isSuccess ? fitting.length : null,
            isAssessing,
            nextAt: deadlines?.next.at ?? null,
          })}
        </Text>
      }
      rail={
        isPhone ? undefined : (
          <>
            {reminders}
            <ProfileCard />
            <RulesCard />
          </>
        )
      }
      railLabel="Påminnelser, profil och hjälp"
    >
      {/* A phone has no rail: the reminders follow the matches and the profile comes after what is coming. */}
      {isPhone ? (
        <VStack gap={6}>
          {nextCard}
          {matchesSection}
          {reminders}
          <UpcomingSection />
          <ProfileCard />
          <RulesCard />
        </VStack>
      ) : (
        <VStack gap={10}>
          {nextCard}
          {matchesSection}
          <UpcomingSection />
        </VStack>
      )}
    </Page>
  );
}

/**
 * Start, the company's home (direction.md, section 4 "Start"): the answer first. The next deadline with its
 * reminder, the matches as cards, then what the agreement catalogue says is coming; the reminders, the profile behind
 * the matches and Regelhjälpen as small cards beside them. It replaces the old watch page (/bevakning redirects here).
 */
export default function StartPage() {
  return <RequireRole role="foretagare" title="Start">{(user) => <StartContent user={user} />}</RequireRole>;
}
