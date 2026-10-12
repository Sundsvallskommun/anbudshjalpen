import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { pixel, proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useAiUsage, useConfig } from "../../api/queries";
import type { AiUsageTaskView } from "../../api/types";
import { ErrorNotice, Loading } from "../../components/states";
import { formatNumber, formatSekCost, plural } from "../../lib/format";
import { aiTaskLabel } from "../../lib/labels";
import { useIsPhone } from "../../lib/usePhone";
import { DEFAULT_DAYS, engineNote, modelsLine, PERIODS, priceNote, summaryLine } from "./aiUsage";
import styles from "./DriftPage.module.css";

interface TaskRow extends Record<string, unknown> {
  item: AiUsageTaskView;
}

/** A figure right-aligned in tabular numbers; nothing to show is a quiet dash with the reason for screen readers. */
function Figure({ text, missing }: { text: string | null; missing: string }) {
  if (text === null) {
    return (
      <>
        <Text color="secondary" aria-hidden="true">
          –
        </Text>
        <VisuallyHidden>{missing}</VisuallyHidden>
      </>
    );
  }
  return <Text hasTabularNumbers>{text}</Text>;
}

function tokens(value: number, counted: number): string | null {
  return counted === 0 ? null : formatNumber(value);
}

const UNCOUNTED = "inga tokens räknade";
const UNPRICED = "ingen uppskattning";

const COLUMNS: TableColumn<TaskRow>[] = [
  {
    key: "task",
    header: "Uppgift",
    width: proportional(1, { minWidth: 0 }),
    renderCell: ({ item }) => <Text>{aiTaskLabel(item.task)}</Text>,
  },
  { key: "calls", header: "Anrop", width: pixel(88), align: "end", renderCell: ({ item }) => <Figure text={formatNumber(item.calls)} missing="0" /> },
  {
    key: "input",
    header: "Tokens in",
    width: pixel(120),
    align: "end",
    renderCell: ({ item }) => <Figure text={tokens(item.input_tokens, item.calls_with_usage)} missing={UNCOUNTED} />,
  },
  {
    key: "output",
    header: "Tokens ut",
    width: pixel(112),
    align: "end",
    renderCell: ({ item }) => <Figure text={tokens(item.output_tokens, item.calls_with_usage)} missing={UNCOUNTED} />,
  },
  {
    key: "cost",
    header: "Kostnad",
    width: pixel(112),
    align: "end",
    renderCell: ({ item }) => <Figure text={item.cost_sek === null ? null : formatSekCost(item.cost_sek)} missing={UNPRICED} />,
  },
];

/**
 * On a phone the calls stand under the task's name and the two token columns become one, so the name keeps room
 * to wrap by words: at 390 px four fixed columns left it a sliver that broke "Bedöma matchning" mid-word.
 */
const PHONE_COLUMNS: TableColumn<TaskRow>[] = [
  {
    key: "task",
    header: "Uppgift",
    width: proportional(1, { minWidth: 0 }),
    renderCell: ({ item }) => (
      <VStack gap={0}>
        <Text>{aiTaskLabel(item.task)}</Text>
        <Text type="supporting">{plural(item.calls, "anrop", "anrop")}</Text>
      </VStack>
    ),
  },
  {
    key: "tokens",
    header: "Tokens",
    width: pixel(88),
    align: "end",
    renderCell: ({ item }) => (
      <Figure text={tokens(item.input_tokens + item.output_tokens, item.calls_with_usage)} missing={UNCOUNTED} />
    ),
  },
  { ...COLUMNS[4]!, width: pixel(84) },
];

function Usage({ days }: { days: number }) {
  const usage = useAiUsage(days);
  const config = useConfig();
  const isPhone = useIsPhone();
  if (usage.isPending) return <Loading label="Hämtar AI-användningen …" />;
  if (usage.isError) {
    return <ErrorNotice title="AI-användningen kunde inte hämtas" error={usage.error} onRetry={() => usage.refetch()} />;
  }
  const view = usage.data;
  const note = config.data ? engineNote(config.data.ai_engine) : null;
  const models = modelsLine(view.by_model);
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Text weight="medium">{summaryLine(view)}</Text>
        {models && <Text type="supporting">{models}</Text>}
      </VStack>
      {view.by_task.length > 0 && (
        <Table
          data={view.by_task.map((item) => ({ item }))}
          columns={isPhone ? PHONE_COLUMNS : COLUMNS}
          idKey={(row) => row.item.task}
          density="compact"
        />
      )}
      <VStack gap={1}>
        {note && <Text type="supporting">{note}</Text>}
        <Text type="supporting">{priceNote(view)}</Text>
      </VStack>
    </VStack>
  );
}

/**
 * Drift's "AI-användning": the AI engine's calls over a period the reader chooses, their tokens and the estimated
 * cost, one line of sums and a row per task. Every completed call is counted; a call whose tokens the engine did not
 * report is counted without them, and the section says so and why. The cost is an estimate from the prices the
 * operator set, never an invoice.
 */
export function AiUsageSection() {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const headingId = "drift-ai-anvandning";
  return (
    <Card padding={0}>
      <VStack as="section" aria-labelledby={headingId} gap={0}>
        <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap" className={styles.head}>
          <VStack gap={0.5} className={styles.main}>
            <Heading level={2} id={headingId}>
              AI-användning
            </Heading>
            <Text type="supporting">Anrop till AI-motorn, deras tokens och vad de uppskattningsvis kostar.</Text>
          </VStack>
          <SegmentedControl label="Period" size="sm" value={String(days)} onChange={(value) => setDays(Number(value))}>
            {PERIODS.map((period) => (
              <SegmentedControlItem key={period.days} value={String(period.days)} label={period.label} />
            ))}
          </SegmentedControl>
        </HStack>
        <VStack gap={3} className={styles.body}>
          <Usage days={days} />
        </VStack>
      </VStack>
    </Card>
  );
}
