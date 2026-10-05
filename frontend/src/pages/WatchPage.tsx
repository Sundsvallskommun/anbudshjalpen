import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useDismissMatch, useMatches, useUpcoming } from "../api/queries";
import type { Fit, MatchView, UpcomingProcurement, UserView } from "../api/types";
import { citationHref, CitationChip } from "../components/citations/CitationChip";
import { DeadlineText, noticeOrigin } from "../components/NoticeRow";
import { Row, RowList } from "../components/RowList";
import { ErrorNotice, Loading } from "../components/states";
import { FictitiousToken, FitToken } from "../components/tokens";
import { formatCalendarDate, formatMonthRange } from "../lib/format";
import { REASON_KIND } from "../lib/labels";
import { Page } from "../shell/Page";
import { RequireRole } from "../shell/RequireRole";

const MONTHS_AHEAD = 18;
const FIT_ORDER: Record<Fit, number> = { passar: 0, passar_delvis: 1, passar_inte: 2 };

/** Still open for tenders first, then by fit, then by the nearest deadline. */
export function sortMatches(matches: readonly MatchView[], now: Date = new Date()): MatchView[] {
  const isClosed = (match: MatchView) =>
    match.notice.status === "closed" ||
    match.notice.status === "awarded" ||
    (match.notice.deadline_at !== null && new Date(match.notice.deadline_at) < now);
  return [...matches].sort(
    (a, b) =>
      Number(isClosed(a)) - Number(isClosed(b)) ||
      FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
      (a.notice.deadline_at ?? "9999").localeCompare(b.notice.deadline_at ?? "9999"),
  );
}

function MatchItem({ match }: { match: MatchView }) {
  const dismiss = useDismissMatch();
  const { notice, assessment } = match;
  return (
    <VStack gap={3}>
      <VStack gap={2}>
        <Heading level={3}>
          <Link href={`/upphandlingar/${notice.id}`}>{notice.title}</Link>
        </Heading>
        <Text color="secondary">{noticeOrigin(notice)}</Text>
        <HStack gap={2} wrap="wrap">
          <FitToken fit={match.fit} />
          {notice.is_fictitious && <FictitiousToken />}
        </HStack>
        <DeadlineText deadline={notice.deadline_at} />
      </VStack>
      <Text as="p">{assessment.summary}</Text>
      <VStack as="ul" role="list" gap={2} aria-label="Skäl">
        {assessment.reasons.map((reason, index) => (
          <VStack as="li" key={index} gap={1} hAlign="start">
            <Text>
              <Text weight="semibold">{REASON_KIND[reason.kind]}:</Text> {reason.text}
            </Text>
            {reason.citation && (
              <CitationChip citation={reason.citation} href={citationHref(notice.id, reason.citation)} />
            )}
          </VStack>
        ))}
      </VStack>
      <HStack gap={2}>
        <Button
          label={`Inte intressant: ${notice.title}`}
          size="sm"
          variant="ghost"
          isLoading={dismiss.isPending}
          onClick={() => dismiss.mutate(match.id)}
        >
          Inte intressant
        </Button>
      </HStack>
    </VStack>
  );
}

function Matches({ user }: { user: UserView }) {
  const matches = useMatches();
  return (
    <VStack gap={4} as="section" aria-labelledby="matches-heading">
      <VStack gap={1}>
        <Heading level={2} id="matches-heading">
          Träffar
        </Heading>
        <Text color="secondary">
          {`Upphandlingar som kan passa ${user.company?.name ?? "ert företag"}, bedömda mot er profil och kraven i underlaget.`}
        </Text>
      </VStack>
      {matches.isPending && <Loading label="Hämtar träffar …" />}
      {matches.isError && (
        <ErrorNotice title="Träffarna kunde inte hämtas" error={matches.error} onRetry={() => matches.refetch()} />
      )}
      {matches.isSuccess && matches.data.length === 0 && (
        <EmptyState
          headingLevel={3}
          title="Inga träffar ännu"
          description="Bevakningen jämför nya upphandlingar med er profil. En tydlig beskrivning och rätt CPV-koder ger bättre träffar."
          actions={<Button label="Uppdatera profilen" href="/profil" />}
        />
      )}
      {matches.isSuccess && matches.data.length > 0 && (
        <RowList label="Träffar">
          {sortMatches(matches.data).map((match) => (
            <Row key={match.id}>
              <MatchItem match={match} />
            </Row>
          ))}
        </RowList>
      )}
      <Text type="supporting">
        Bedömningen är AI-genererad och ett stöd. Läs alltid kraven i underlaget innan ni bestämmer er.
      </Text>
    </VStack>
  );
}

function UpcomingItem({ item }: { item: UpcomingProcurement }) {
  return (
    <VStack gap={2}>
      <Heading level={3}>{item.title}</Heading>
      <HStack gap={2} wrap="wrap">
        {item.relevant_for_company && <Token label="Relevant för er" color="green" />}
        {item.category && <Token label={item.category} />}
        {item.is_fictitious && <FictitiousToken />}
      </HStack>
      {item.announcement_overdue ? (
        <Text>
          <Text weight="semibold">Borde redan ha annonserats</Text>{" "}
          {`(väntades ${formatMonthRange(item.expected_from, item.expected_to)}).`}{" "}
          <Link href="/upphandlingar?status=open">Sök bland de öppna annonserna</Link>
        </Text>
      ) : (
        <Text>
          <Text weight="semibold">Väntas annonseras:</Text> {formatMonthRange(item.expected_from, item.expected_to)}
        </Text>
      )}
      <Text color="secondary">
        {`Nuvarande avtal löper ut ${formatCalendarDate(item.end_date)}${
          item.max_end_date && item.max_end_date !== item.end_date
            ? ` och kan förlängas till längst ${formatCalendarDate(item.max_end_date)}`
            : ""
        }.`}
      </Text>
      {item.previous_requirements && (
        <Text>
          <Text weight="semibold">Förra gången krävdes:</Text> {item.previous_requirements}
        </Text>
      )}
    </VStack>
  );
}

function Upcoming() {
  const upcoming = useUpcoming(MONTHS_AHEAD);
  const [onlyRelevant, setOnlyRelevant] = useState(true);
  const items = (upcoming.data ?? []).filter((item) => !onlyRelevant || item.relevant_for_company);

  return (
    <VStack gap={4} as="section" aria-labelledby="upcoming-heading">
      <VStack gap={1}>
        <Heading level={2} id="upcoming-heading">
          Kommande upphandlingar
        </Heading>
        <Text color="secondary">
          {`Bygger på kommunens avtalskatalog: när ett avtal löper ut annonseras en ny upphandling, oftast 6–9 månader innan. Visar de närmaste ${MONTHS_AHEAD} månaderna.`}
        </Text>
      </VStack>
      <CheckboxInput label="Visa bara de som är relevanta för er" value={onlyRelevant} onChange={setOnlyRelevant} />
      {upcoming.isPending && <Loading label="Hämtar kommande upphandlingar …" />}
      {upcoming.isError && (
        <ErrorNotice
          title="Kommande upphandlingar kunde inte hämtas"
          error={upcoming.error}
          onRetry={() => upcoming.refetch()}
        />
      )}
      {upcoming.isSuccess && items.length === 0 && (
        <EmptyState
          headingLevel={3}
          isCompact
          title="Inga kommande upphandlingar att visa"
          description={onlyRelevant ? "Inga avtal inom era CPV-koder löper ut den närmaste tiden." : undefined}
        />
      )}
      {items.length > 0 && (
        <RowList label="Kommande upphandlingar">
          {items.map((item) => (
            <Row key={item.agreement_id}>
              <UpcomingItem item={item} />
            </Row>
          ))}
        </RowList>
      )}
    </VStack>
  );
}

/** Journey step 2: matches marked passar / passar delvis / passar inte, and what is coming. */
export default function WatchPage() {
  return (
    <RequireRole role="foretagare" title="Bevakning">
      {(user) => (
        <Page title="Bevakning" intro="Nya upphandlingar som kan passa er, och upphandlingar som väntas komma.">
          <Matches user={user} />
          <Upcoming />
        </Page>
      )}
    </RequireRole>
  );
}
