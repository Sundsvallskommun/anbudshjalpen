import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stack, StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useUpcoming } from "../../api/queries";
import type { UpcomingProcurement } from "../../api/types";
import { Row, RowList } from "../../components/RowList";
import { ErrorNotice, Loading } from "../../components/states";
import { FictitiousToken } from "../../components/tokens";
import { formatNumber } from "../../lib/format";
import { useIsPhone } from "../../lib/usePhone";
import { agreementEndText, periodText, sortUpcoming, UPCOMING_MONTHS } from "./upcoming";

type Scope = "for-er" | "alla";

/** The timeline shows the five nearest; the rest is one click away. */
const SHOWN = 5;
/** The timeline's period column ("feb–maj 2027 / väntas annonseras"), a structural width. */
const PERIOD_WIDTH = 128;

function Period({ item }: { item: UpcomingProcurement }) {
  const isPhone = useIsPhone();
  return (
    <VStack width={isPhone ? undefined : PERIOD_WIDTH}>
      <Text type="supporting" color="primary" weight="semibold" hasTabularNumbers>
        {periodText(item.expected_from, item.expected_to)}
      </Text>
      <Text type="supporting">{item.announcement_overdue ? "borde redan ha annonserats" : "väntas annonseras"}</Text>
    </VStack>
  );
}

function UpcomingRow({ item }: { item: UpcomingProcurement }) {
  const isPhone = useIsPhone();
  return (
    <Row>
      <Stack direction={isPhone ? "vertical" : "horizontal"} gap={isPhone ? 2 : 6}>
        {/* Static, so a long title never narrows the period column. */}
        <StackItem>
          <Period item={item} />
        </StackItem>
        <StackItem size="fill">
          <VStack gap={3} hAlign="start">
            <VStack gap={1}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={4} accessibilityLevel={3}>
                  {item.title}
                </Heading>
                {item.is_fictitious && <FictitiousToken size="sm" />}
              </HStack>
              <Text type="supporting">{agreementEndText(item)}</Text>
            </VStack>
            {item.announcement_overdue && (
              <Link href={`/upphandlingar?q=${encodeURIComponent(item.title)}`}>
                Sök bland de öppna upphandlingarna
              </Link>
            )}
            {item.previous_requirements && (
              <Collapsible
                defaultIsOpen={false}
                chevronPosition="start"
                trigger={
                  <Text type="supporting" color="accent" weight="semibold">
                    Förbered er: det här krävdes förra gången
                  </Text>
                }
              >
                <Section variant="muted" padding={3}>
                  <Text as="p">{item.previous_requirements}</Text>
                </Section>
              </Collapsible>
            )}
          </VStack>
        </StackItem>
      </Stack>
    </Row>
  );
}

/**
 * "Kommande upphandlingar" (direction.md, section 4 "Start"): what the agreement catalogue says is coming, as a
 * timeline with the period on the left. "För er" shows those in the company's CPV codes, and is chosen while there
 * are any; what was required last time sits behind "Förbered er".
 */
export function UpcomingSection() {
  const upcoming = useUpcoming(UPCOMING_MONTHS);
  const [chosenScope, setChosenScope] = useState<Scope | null>(null);
  const [isAll, setIsAll] = useState(false);
  const items = upcoming.data ?? [];
  const relevant = items.filter((item) => item.relevant_for_company);
  // "För er" until the list says there is nothing for the company, so the choice does not flip while it loads.
  const scope = chosenScope ?? (upcoming.isSuccess && relevant.length === 0 ? "alla" : "for-er");
  const list = sortUpcoming(scope === "for-er" ? relevant : items);
  const shown = isAll ? list : list.slice(0, SHOWN);

  return (
    <VStack as="section" id="kommande" aria-labelledby="kommande-rubrik" gap={4}>
      <VStack gap={1}>
        <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={2} id="kommande-rubrik">
            Kommande upphandlingar
          </Heading>
          <SegmentedControl
            label="Visa kommande upphandlingar"
            size="sm"
            value={scope}
            onChange={(value) => {
              setChosenScope(value as Scope);
              setIsAll(false);
            }}
          >
            <SegmentedControlItem value="for-er" label="För er" />
            <SegmentedControlItem value="alla" label="Alla" />
          </SegmentedControl>
        </HStack>
        <Text type="supporting">
          Från kommunens avtalskatalog. En ny upphandling annonseras oftast 6–9 månader innan avtalet löper ut.
        </Text>
      </VStack>
      {upcoming.isPending && <Loading label="Hämtar kommande upphandlingar …" />}
      {upcoming.isError && (
        <ErrorNotice
          title="Kommande upphandlingar kunde inte hämtas"
          error={upcoming.error}
          onRetry={() => upcoming.refetch()}
        />
      )}
      {upcoming.isSuccess && list.length === 0 && (
        <Card>
          <EmptyState
            headingLevel={3}
            isCompact
            title="Inga kommande upphandlingar att visa"
            description={
              scope === "for-er"
                ? "Inga avtal inom era CPV-koder löper ut den närmaste tiden."
                : "Inga avtal i katalogen löper ut den närmaste tiden."
            }
            actions={
              scope === "for-er" && items.length > 0 ? (
                <Button
                  label={`Visa alla (${formatNumber(items.length)})`}
                  size="sm"
                  onClick={() => setChosenScope("alla")}
                />
              ) : undefined
            }
          />
        </Card>
      )}
      {shown.length > 0 && (
        <Card padding={0}>
          <RowList as="ol" label="Kommande upphandlingar" isInset>
            {shown.map((item) => (
              <UpcomingRow key={item.agreement_id} item={item} />
            ))}
          </RowList>
        </Card>
      )}
      {list.length > SHOWN && (
        <HStack>
          <Button
            label={isAll ? "Visa färre" : `Visa alla ${formatNumber(list.length)}`}
            variant="ghost"
            size="sm"
            aria-expanded={isAll}
            onClick={() => setIsAll((value) => !value)}
          />
        </HStack>
      )}
    </VStack>
  );
}
