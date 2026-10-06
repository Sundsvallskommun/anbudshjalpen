import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { pixel, proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useInsights } from "../../api/queries";
import type { InsightItem } from "../../api/types";
import { ErrorNotice, Loading } from "../../components/states";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { formatNumber } from "../../lib/format";
import { percentOf, visibleFromText } from "./insights";

interface QuestionRow extends Record<string, unknown> {
  item: InsightItem;
}

/** A count right-aligned in tabular figures; zero is a quiet dash, read as "0". */
function Count({ value, share }: { value: number; share?: number | null }) {
  if (value === 0) {
    return (
      <>
        <Text color="secondary" aria-hidden="true">
          –
        </Text>
        <VisuallyHidden>0</VisuallyHidden>
      </>
    );
  }
  return (
    <Text hasTabularNumbers>{share === undefined || share === null ? formatNumber(value) : `${formatNumber(value)} (${share} %)`}</Text>
  );
}

/** The questions themselves: shown after sista anbudsdag, hidden while the tender runs. */
function Questions({ item }: { item: InsightItem }) {
  if (!item.visible) {
    return (
      <HStack gap={1} vAlign="center">
        <Icon icon="eyeSlash" color="secondary" size="sm" />
        <Text type="supporting">{`Frågorna är dolda. ${visibleFromText(item.deadline_at)}.`}</Text>
      </HStack>
    );
  }
  if (item.sample_questions.length === 0) return null;
  return (
    <Collapsible
      defaultIsOpen={false}
      trigger={<Text type="supporting" color="primary">{`Senaste frågorna (${item.sample_questions.length})`}</Text>}
    >
      <VStack as="ul" role="list" gap={1} aria-label={`Senaste frågorna om ${item.notice_title}`}>
        {item.sample_questions.map((question) => (
          <li key={question}>
            <Text>{question}</Text>
          </li>
        ))}
      </VStack>
    </Collapsible>
  );
}

function Notice({ item }: { item: InsightItem }) {
  return (
    <VStack gap={1} hAlign="start">
      <Link href={`/upphandlingar/${item.notice_id}`}>{item.notice_title}</Link>
      <Questions item={item} />
    </VStack>
  );
}

const COLUMNS: TableColumn<QuestionRow>[] = [
  { key: "notice", header: "Upphandling", width: proportional(3), renderCell: ({ item }) => <Notice item={item} /> },
  {
    key: "deadline",
    header: "Sista anbudsdag",
    width: pixel(172),
    renderCell: ({ item }) =>
      item.deadline_at ? <DeadlineBlock deadline={item.deadline_at} variant="compact" /> : <Count value={0} />,
  },
  {
    key: "questions",
    header: "Frågor",
    width: pixel(90),
    align: "end",
    renderCell: ({ item }) => <Count value={item.question_count} />,
  },
  {
    key: "notFound",
    header: "Utan svar i underlaget",
    width: pixel(212),
    align: "end",
    renderCell: ({ item }) => (
      <Count value={item.not_in_document_count} share={percentOf(item.not_in_document_count, item.question_count)} />
    ),
  },
  {
    key: "formal",
    header: "Till e-Avrop",
    width: pixel(128),
    align: "end",
    renderCell: ({ item }) => <Count value={item.formal_question_suggestions} />,
  },
];

/**
 * Narrower than the full table (724 px, on a phone or zoomed in) the deadline and the other counts stand under the
 * title, so the table fits the screen instead of scrolling sideways.
 */
const NARROW_QUERY = "(width < 760px)";

function NarrowNotice({ item }: { item: InsightItem }) {
  const share = percentOf(item.not_in_document_count, item.question_count);
  return (
    <VStack gap={1} hAlign="start">
      <Link href={`/upphandlingar/${item.notice_id}`}>{item.notice_title}</Link>
      {item.deadline_at && <DeadlineBlock deadline={item.deadline_at} variant="inline" label="Sista anbudsdag" />}
      <Text type="supporting">
        {`${formatNumber(item.not_in_document_count)} utan svar i underlaget${share === null ? "" : ` (${share} %)`} · ${formatNumber(item.formal_question_suggestions)} till e-Avrop`}
      </Text>
      <Questions item={item} />
    </VStack>
  );
}

const NARROW_COLUMNS: TableColumn<QuestionRow>[] = [
  { key: "notice", header: "Upphandling", width: proportional(1, { minWidth: 0 }), renderCell: ({ item }) => <NarrowNotice item={item} /> },
  {
    key: "questions",
    header: "Frågor",
    width: pixel(72),
    align: "end",
    renderCell: ({ item }) => <Count value={item.question_count} />,
  },
];

/**
 * "Företagens frågor" (direction.md, section 4): per notice how many questions companies asked the coach, how many
 * the document did not answer and how many were pointed to e-Avrop. No company is named, and the questions themselves
 * stay hidden until sista anbudsdag, so nothing during the tender can favour a supplier; the rule is said once, above.
 */
export function CompanyQuestions() {
  const insights = useInsights();
  const isNarrow = useMediaQuery(NARROW_QUERY);
  return (
    <VStack gap={4}>
      <VStack gap={1} maxWidth="72ch">
        <Text as="p">
          Frågorna visas först efter sista anbudsdag, så att inget under anbudstiden kan gynna någon leverantör. Antalen
          syns hela tiden, och inget företag namnges.
        </Text>
        <Text as="p" color="secondary">
          Många frågor utan svar i underlaget kan tyda på att något behöver förtydligas, nu i e-Avrop eller nästa gång.
        </Text>
      </VStack>
      {insights.isPending && <Loading label="Hämtar frågorna …" />}
      {insights.isError && (
        <ErrorNotice title="Frågorna kunde inte hämtas" error={insights.error} onRetry={() => insights.refetch()} />
      )}
      {insights.isSuccess && insights.data.length === 0 && (
        <Card>
          <EmptyState
            headingLevel={3}
            title="Inga frågor ännu"
            description="När företag frågar coachen om en upphandling syns antalen här, per upphandling."
          />
        </Card>
      )}
      {insights.isSuccess && insights.data.length > 0 && (
        <Card padding={0}>
          <Table
            aria-label="Frågor per upphandling"
            data={insights.data.map((item) => ({ item }))}
            columns={isNarrow ? NARROW_COLUMNS : COLUMNS}
            idKey={(row) => row.item.notice_id}
            verticalAlign="top"
          />
        </Card>
      )}
    </VStack>
  );
}
