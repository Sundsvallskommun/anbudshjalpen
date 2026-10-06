import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useLocation } from "react-router";
import { useMatches, useUpcoming } from "../../api/queries";
import type { UpcomingProcurement, UserView } from "../../api/types";
import { RowEnd } from "../../components/RowList";
import { ErrorNotice, Loading } from "../../components/states";
import { FictitiousToken, FitToken } from "../../components/tokens";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { plural } from "../../lib/format";
import { CardHeading, HeadingCount } from "../start/CardHeading";
import { ForwardLink } from "../start/ForwardLink";
import { isFitting, sortMatches } from "../start/start";
import { periodLines, sortUpcoming, UPCOMING_MONTHS } from "../start/upcoming";

/** The rail shows a few of each; the rest is on Start. */
const SHOWN = 3;
/** The timeline's period column ("feb–maj" over "2027"), a structural width. */
const PERIOD_WIDTH = 80;

function RailHeading({ id, children, count }: { id: string; children: string; count?: number }) {
  return (
    <CardHeading id={id}>
      <HStack as="span" gap={2} vAlign="center">
        {children}
        {count !== undefined && <HeadingCount count={count} noun={["upphandling", "upphandlingar"]} />}
      </HStack>
    </CardHeading>
  );
}

/** "Passar er": the open notices the company's matches say fit, with their deadlines. */
function FitCard({ companyName }: { companyName: string }) {
  const matches = useMatches();
  const fitting = sortMatches((matches.data ?? []).filter(isFitting));
  return (
    <Card>
      <VStack as="section" aria-labelledby="passar-er" gap={4}>
        <RailHeading id="passar-er" count={matches.isSuccess ? fitting.length : undefined}>
          Passar er
        </RailHeading>
        {matches.isPending && <Loading label="Hämtar träffar …" />}
        {matches.isError && (
          <ErrorNotice title="Träffarna kunde inte hämtas" error={matches.error} onRetry={() => matches.refetch()} />
        )}
        {matches.isSuccess && (
          <>
            <Text as="p">
              {fitting.length > 0
                ? `${plural(fitting.length, "öppen upphandling", "öppna upphandlingar")} verkar passa ${companyName}.`
                : "Inga öppna upphandlingar verkar passa er just nu. Du får ett mejl när en ny verkar passa."}
            </Text>
            {fitting.length > 0 && (
              <VStack as="ul" role="list" gap={4}>
                {fitting.slice(0, SHOWN).map((match, index) => (
                  // A line between the notices, as titles often take two lines in the rail.
                  <VStack as="li" key={match.id} gap={4}>
                    {index > 0 && <Divider />}
                    <HStack gap={4} vAlign="start">
                      <StackItem size="fill">
                        <VStack gap={1} hAlign="start">
                          <FitToken fit={match.fit} size="sm" />
                          <Link href={`/upphandlingar/${match.notice.id}`} isStandalone weight="semibold">
                            {match.notice.title}
                          </Link>
                        </VStack>
                      </StackItem>
                      {match.notice.deadline_at && (
                        <RowEnd>
                          <DeadlineBlock
                            deadline={match.notice.deadline_at}
                            label="Sista anbudsdag"
                            variant="compact"
                            align="end"
                          />
                        </RowEnd>
                      )}
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            )}
            <ForwardLink href="/start">{fitting.length > 0 ? "Se träffarna på Start" : "Till Start"}</ForwardLink>
          </>
        )}
      </VStack>
    </Card>
  );
}

/** A visitor sees what signing in gives: what fits the company. */
function LoginCard() {
  const { pathname, search } = useLocation();
  return (
    <Card>
      <VStack as="section" aria-labelledby="logga-in-kort" gap={4} hAlign="start">
        <CardHeading id="logga-in-kort">Logga in för att se vad som passar ert företag</CardHeading>
        <Button label="Logga in" href={`/logga-in?till=${encodeURIComponent(pathname + search)}`} />
      </VStack>
    </Card>
  );
}

/** One expected procurement: when it is expected ("feb–maj" over "2027") and what it is. */
function UpcomingItem({ item }: { item: UpcomingProcurement }) {
  const period = periodLines(item.expected_from, item.expected_to);
  return (
    <HStack as="li" gap={4} vAlign="start">
      {/* Static, so a long title never squeezes the period onto more lines than the others. */}
      <StackItem>
        <VStack width={PERIOD_WIDTH}>
          <VisuallyHidden>Väntas annonseras</VisuallyHidden>
          <Text weight="semibold" hasTabularNumbers>
            {period.months}
          </Text>
          <Text type="supporting" hasTabularNumbers>
            {period.years}
          </Text>
        </VStack>
      </StackItem>
      <StackItem size="fill">
        <VStack gap={1} hAlign="start">
          <Text>{item.title}</Text>
          {item.is_fictitious && <FictitiousToken size="sm" />}
        </VStack>
      </StackItem>
    </HStack>
  );
}

/** "Kommande enligt avtalskatalogen": the next procurements expected, as a short timeline. */
function UpcomingCard({ isCompany }: { isCompany: boolean }) {
  const upcoming = useUpcoming(UPCOMING_MONTHS);
  const items = sortUpcoming(
    (upcoming.data ?? []).filter((item) => !item.announcement_overdue),
    isCompany,
  ).slice(0, SHOWN);
  if (upcoming.isSuccess && items.length === 0) return null;
  return (
    <Card>
      <VStack as="section" aria-labelledby="kommande-kort" gap={4}>
        <CardHeading id="kommande-kort">Kommande enligt avtalskatalogen</CardHeading>
        {upcoming.isPending && <Loading label="Hämtar kommande upphandlingar …" />}
        {upcoming.isError && (
          <ErrorNotice
            title="Kommande upphandlingar kunde inte hämtas"
            error={upcoming.error}
            onRetry={() => upcoming.refetch()}
          />
        )}
        {items.length > 0 && (
          <VStack as="ul" role="list" gap={4}>
            {items.map((item) => (
              <UpcomingItem key={item.agreement_id} item={item} />
            ))}
          </VStack>
        )}
        {isCompany && upcoming.isSuccess && <ForwardLink href="/start#kommande">Se alla på Start</ForwardLink>}
      </VStack>
    </Card>
  );
}

/**
 * The list's rail (direction.md, section 4 "Upphandlingar"): for a company what fits it, for a visitor a reason to
 * sign in, and for everyone what is coming according to the agreement catalogue.
 */
export function NoticesRail({ viewer }: { viewer: UserView | null }) {
  const isCompany = viewer?.role === "foretagare";
  return (
    <>
      {isCompany && <FitCard companyName={viewer.company?.name ?? "ert företag"} />}
      {!viewer && <LoginCard />}
      <UpcomingCard isCompany={isCompany} />
    </>
  );
}
