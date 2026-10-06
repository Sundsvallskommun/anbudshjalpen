import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { pixel, proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useAdminChecklists } from "../../api/queries";
import type { ChecklistAdminItem } from "../../api/types";
import { ErrorNotice, Loading } from "../../components/states";
import { ChecklistStatusToken } from "../../components/tokens";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { formatClock, formatNumber, formatShortDate, plural } from "../../lib/format";
import { engineLabel } from "../../lib/labels";

import { Interpretations } from "./Interpretations";
import { itemsInView, needsHandling, QUEUE_VIEWS, sourceCounts, supersededIds, type QueueView } from "./queue";
import { ViewSwitch } from "./ViewSwitch";

interface QueueRow extends Record<string, unknown> {
  item: ChecklistAdminItem;
  isSuperseded: boolean;
}

/** "41/41" with a check when every source was found, else a yellow token with how many to look at. */
function Sources({ item }: { item: ChecklistAdminItem }) {
  const { found, total, toCheck } = sourceCounts(item.verification);
  if (total === 0) return <Text color="secondary">Inga</Text>;
  if (toCheck === 0) {
    return (
      <HStack gap={1} vAlign="center">
        <Icon icon="success" color="success" size="sm" />
        <Text hasTabularNumbers aria-hidden="true">{`${formatNumber(found)}/${formatNumber(total)}`}</Text>
        <VisuallyHidden>{`Alla ${formatNumber(total)} hittades`}</VisuallyHidden>
      </HStack>
    );
  }
  return (
    <Token
      label={`${formatNumber(toCheck)} att kontrollera`}
      color="yellow"
      size="sm"
      icon={<Icon icon="warning" size="sm" />}
    />
  );
}

/** The checklist's status, and under it when a newer interpretation of the notice has replaced it (in words that wrap). */
function Status({ item, isSuperseded }: QueueRow) {
  return (
    <VStack gap={1} hAlign="start">
      <ChecklistStatusToken status={item.status} size="sm" />
      {isSuperseded && <Text type="supporting">Ersatt av nyare tolkning</Text>}
    </VStack>
  );
}

function ReviewButton({ item }: { item: ChecklistAdminItem }) {
  if (!needsHandling(item.status)) return null;
  return (
    <Button label={`Granska ${item.notice_title}`} size="sm" href={`/inkop/checklistor/${item.id}`}>
      Granska
    </Button>
  );
}

function Interpreted({ item }: { item: ChecklistAdminItem }) {
  const clock = formatClock(item.created_at);
  return (
    <VStack gap={0}>
      <Text hasTabularNumbers>{clock ? `${formatShortDate(item.created_at)} ${clock}` : formatShortDate(item.created_at)}</Text>
      <Text type="supporting">{engineLabel(item.engine)}</Text>
    </VStack>
  );
}

// The fixed columns are as wide as their contents need; the notice's title takes the rest, at least 200 px, so the
// whole table needs 976 px.
const COLUMNS: TableColumn<QueueRow>[] = [
  {
    key: "notice",
    header: "Upphandling",
    width: proportional(1, { minWidth: 200 }),
    renderCell: ({ item }) => <Link href={`/inkop/checklistor/${item.id}`}>{item.notice_title}</Link>,
  },
  {
    key: "deadline",
    header: "Sista anbudsdag",
    width: pixel(152),
    renderCell: ({ item }) =>
      item.deadline_at ? (
        <DeadlineBlock deadline={item.deadline_at} variant="compact" />
      ) : (
        <Text color="secondary">Anges inte</Text>
      ),
  },
  { key: "status", header: "Status", width: pixel(128), renderCell: (row) => <Status {...row} /> },
  { key: "sources", header: "Källor", width: pixel(172), renderCell: ({ item }) => <Sources item={item} /> },
  {
    key: "requirements",
    header: "Krav",
    width: pixel(64),
    align: "end",
    renderCell: ({ item }) => <Text hasTabularNumbers>{formatNumber(item.requirement_count)}</Text>,
  },
  { key: "interpreted", header: "Tolkad", width: pixel(152), renderCell: ({ item }) => <Interpreted item={item} /> },
  {
    key: "action",
    header: <VisuallyHidden>Åtgärd</VisuallyHidden>,
    width: pixel(108),
    align: "end",
    renderCell: ({ item }) => <ReviewButton item={item} />,
  },
];

/**
 * Where the full table would be cramped (it needs 976 px; below 1 100 px the titles get too little room: on a phone, a
 * tablet or zoomed in) the facts stand under the title, so the table fits with its "Granska" beside them instead of
 * scrolling sideways.
 */
const NARROW_QUERY = "(width < 1100px)";

/** The facts under the title, for the narrow table. */
function NarrowSummary({ item, isSuperseded }: QueueRow) {
  const { total, toCheck } = sourceCounts(item.verification);
  const requirements = plural(item.requirement_count, "krav", "krav");
  return (
    <VStack gap={1} hAlign="start">
      <Link href={`/inkop/checklistor/${item.id}`}>{item.notice_title}</Link>
      <Status item={item} isSuperseded={isSuperseded} />
      {item.deadline_at ? (
        <DeadlineBlock deadline={item.deadline_at} variant="inline" label="Sista anbudsdag" />
      ) : (
        <Text type="supporting">Sista anbudsdag anges inte</Text>
      )}
      {toCheck > 0 ? (
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Sources item={item} />
          <Text type="supporting">{`· ${requirements}`}</Text>
        </HStack>
      ) : (
        <Text type="supporting">
          {`${total === 0 ? "Inga källhänvisningar" : `Alla ${formatNumber(total)} källor hittades`} · ${requirements}`}
        </Text>
      )}
    </VStack>
  );
}

const NARROW_COLUMNS: TableColumn<QueueRow>[] = [
  { key: "notice", header: "Upphandling", width: proportional(1, { minWidth: 0 }), renderCell: (row) => <NarrowSummary {...row} /> },
  {
    key: "action",
    header: <VisuallyHidden>Åtgärd</VisuallyHidden>,
    width: pixel(124),
    align: "end",
    renderCell: ({ item }) => <ReviewButton item={item} />,
  },
];

const EMPTY: Record<QueueView, { title: string; description: string }> = {
  hantera: { title: "Inget att hantera", description: "Alla checklistor är granskade. Nya utkast hamnar här." },
  publicerade: { title: "Inga publicerade checklistor", description: "Checklistor du publicerar syns här." },
  avvisade: { title: "Inga avvisade checklistor", description: "Checklistor du avvisar eller drar tillbaka syns här." },
  alla: { title: "Inga checklistor ännu", description: "När ett underlag har tolkats hamnar checklistan här." },
};

/**
 * "Att granska" (direction.md, section 4): the checklists in a table, soonest sista anbudsdag first. "Att hantera"
 * lists drafts and approved ones not yet published, so nothing stops halfway; an older draft that a newer
 * interpretation replaced says so. Documents that could not be interpreted are shown above.
 */
export function ReviewQueue() {
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const [view, setView] = useState<QueueView>("hantera");
  const checklists = useAdminChecklists("all");
  const items = checklists.data ?? [];
  const superseded = supersededIds(items);
  const toHandle = itemsInView(items, "hantera").length;
  const rows: QueueRow[] = itemsInView(items, view).map((item) => ({ item, isSuperseded: superseded.has(item.id) }));

  return (
    <VStack gap={4}>
      <Interpretations />
      <ViewSwitch
        label="Visa checklistor"
        value={view}
        onChange={setView}
        options={QUEUE_VIEWS.map((option) => ({
          value: option.value,
          label: option.value === "hantera" && checklists.isSuccess ? `${option.label} (${toHandle})` : option.label,
        }))}
      />
      {checklists.isPending && <Loading label="Hämtar checklistor …" />}
      {checklists.isError && (
        <ErrorNotice title="Checklistorna kunde inte hämtas" error={checklists.error} onRetry={() => checklists.refetch()} />
      )}
      {checklists.isSuccess && rows.length === 0 && (
        <Card>
          <EmptyState headingLevel={3} title={EMPTY[view].title} description={EMPTY[view].description} />
        </Card>
      )}
      {checklists.isSuccess && rows.length > 0 && (
        <Card padding={0}>
          <Table
            aria-label="Checklistor"
            data={rows}
            columns={isNarrow ? NARROW_COLUMNS : COLUMNS}
            idKey={(row) => row.item.id}
            verticalAlign="top"
            hasHover
          />
        </Card>
      )}
    </VStack>
  );
}
