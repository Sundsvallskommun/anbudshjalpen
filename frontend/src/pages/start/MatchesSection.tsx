import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Ref } from "react";
import type { MatchView } from "../../api/types";
import { NoticeRow } from "../../components/NoticeRow";
import { RowList } from "../../components/RowList";
import { ErrorNotice, Loading } from "../../components/states";
import { relativeDays } from "../../lib/format";
import { useIsPhone } from "../../lib/usePhone";
import { HeadingCount } from "./CardHeading";
import { ForwardLink } from "./ForwardLink";
import { MatchCard } from "./MatchCard";
import type { MatchDismissal } from "./useMatchDismissal";

const HEADING_ID = "nya-traffar";

/** "Bedömda mot er profil. Närmaste sista anbudsdag är om 25 dagar." */
function lead(fitting: readonly MatchView[]): string {
  const nearest = fitting
    .map((match) => match.notice.deadline_at)
    .filter((deadline): deadline is string => deadline !== null)
    .sort()[0];
  return nearest
    ? `Bedömda mot er profil. Närmaste sista anbudsdag är ${relativeDays(nearest)}.`
    : "Bedömda mot er profil.";
}

function NoMatches() {
  return (
    <Card>
      <EmptyState
        headingLevel={3}
        isCompact
        title="Inga nya träffar just nu"
        description="Du får ett mejl när en ny upphandling verkar passa er. Träffarna bygger på er företagsprofil."
        actions={<Button label="Ändra profil" href="/profil" size="sm" />}
      />
    </Card>
  );
}

/** Assessed, but the engine thinks they do not fit: out of the way, yet one click from view. */
function NotFitting({ matches }: { matches: readonly MatchView[] }) {
  return (
    <Collapsible
      defaultIsOpen={false}
      chevronPosition="start"
      trigger={<Text weight="semibold">{`Verkar inte passa (${matches.length})`}</Text>}
    >
      <Card padding={0}>
        <RowList label="Verkar inte passa" isInset>
          {matches.map((match) => (
            <NoticeRow key={match.id} notice={match.notice} />
          ))}
        </RowList>
      </Card>
    </Collapsible>
  );
}

export interface MatchesSectionProps {
  query: UseQueryResult<MatchView[]>;
  fitting: readonly MatchView[];
  notFitting: readonly MatchView[];
  dismissal: MatchDismissal;
  /** The heading takes the focus when a card leaves, so keyboard users keep their place in the section. */
  headingRef: Ref<HTMLHeadingElement>;
  /** The match whose card takes the focus when it is shown (back after "Ångra"). */
  focusId: string | null;
  onFocused: () => void;
}

/**
 * "Nya träffar (2)" (direction.md, section 4 "Start"): the matches that fit, as cards, best fit first. A phone keeps
 * the heading row short ("Alla") and leaves out the lead, which the summary under the h1 and "Nästa frist" already
 * say, so the first card starts higher.
 */
export function MatchesSection({
  query,
  fitting,
  notFitting,
  dismissal,
  headingRef,
  focusId,
  onFocused,
}: MatchesSectionProps) {
  const isPhone = useIsPhone();
  return (
    <VStack as="section" aria-labelledby={HEADING_ID} gap={4}>
      <VStack gap={1}>
        <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={2} id={HEADING_ID} ref={headingRef} tabIndex={-1}>
            <HStack as="span" gap={2} vAlign="center">
              Nya träffar
              {/* No "0" beside the heading: the empty card below says there are none. */}
              {query.isSuccess && fitting.length > 0 && (
                <HeadingCount count={fitting.length} noun={["träff", "träffar"]} />
              )}
            </HStack>
          </Heading>
          <ForwardLink href="/upphandlingar">
            {isPhone ? (
              <>
                Alla <VisuallyHidden>upphandlingar</VisuallyHidden>
              </>
            ) : (
              "Visa alla upphandlingar"
            )}
          </ForwardLink>
        </HStack>
        {query.isSuccess && fitting.length > 0 && !isPhone && <Text type="supporting">{lead(fitting)}</Text>}
      </VStack>
      {query.isPending && <Loading label="Hämtar träffar …" />}
      {query.isError && (
        <ErrorNotice title="Träffarna kunde inte hämtas" error={query.error} onRetry={() => query.refetch()} />
      )}
      {query.isSuccess && fitting.length === 0 && <NoMatches />}
      {fitting.length > 0 && (
        <VStack as="ul" role="list" gap={4}>
          {fitting.map((match) => (
            <VStack as="li" key={match.id}>
              <MatchCard
                match={match}
                onDismiss={() => dismissal.dismiss(match)}
                isDismissing={dismissal.dismissingId === match.id}
                hasFocus={focusId === match.id}
                onFocused={onFocused}
              />
            </VStack>
          ))}
        </VStack>
      )}
      {notFitting.length > 0 && <NotFitting matches={notFitting} />}
    </VStack>
  );
}
