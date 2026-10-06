import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { NoticeList, NoticeSort } from "../../api/types";
import { NoticeRow } from "../../components/NoticeRow";
import { RowList } from "../../components/RowList";
import { ErrorNotice, Loading } from "../../components/states";
import { formatNumber } from "../../lib/format";
import { useIsPhone } from "../../lib/usePhone";
import { rangeText, resultText } from "./listCopy";
import {
  CLEARED_FILTERS,
  currentSort,
  hasNarrowingFilters,
  PAGE_SIZE,
  sortChoices,
  type ListState,
  type StatusChoice,
} from "./listState";

const RESULTS_HEADING_ID = "upphandlingar-resultat";

function SortSelector({ value, q, onChange }: { value: NoticeSort; q: string; onChange: (sort: NoticeSort) => void }) {
  const options = sortChoices(q).map(({ value, label }) => ({ value, label }));
  return (
    <HStack gap={2} vAlign="center">
      <Text type="supporting" aria-hidden="true">
        Sortera:
      </Text>
      <Selector
        label="Sortera"
        isLabelHidden
        size="sm"
        options={options}
        value={value}
        onChange={(next) => onChange(next as NoticeSort)}
      />
    </HStack>
  );
}

/** Nothing to list: why, and the way on (clear the filters, or look at the other notices). */
function NoResults({
  state,
  data,
  onChange,
}: {
  state: ListState;
  data: NoticeList;
  onChange: (changes: Partial<ListState>) => void;
}) {
  const others = (["open", "all"] as const).find((status) => status !== state.status && data.counts[status] > 0);
  const showOthers =
    others !== undefined ? (
      <Button
        label={`Visa ${others === "open" ? "öppna" : "alla"} (${formatNumber(data.counts[others])})`}
        onClick={() => onChange({ status: others })}
      />
    ) : null;

  if (hasNarrowingFilters(state)) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<Icon icon="search" />}
        title="Inga upphandlingar matchar sökningen"
        description={
          state.isFitOnly
            ? "Prova ett annat sökord, eller visa även det som inte ligger inom er profil."
            : "Prova ett annat sökord eller ta bort ett filter."
        }
        actions={
          <>
            <Button label="Rensa filter" variant="primary" onClick={() => onChange(CLEARED_FILTERS)} />
            {showOthers}
          </>
        }
      />
    );
  }
  const titles: Record<StatusChoice, string> = {
    open: "Inga öppna upphandlingar just nu",
    planned: "Inga planerade upphandlingar just nu",
    all: "Inga upphandlingar ännu",
  };
  return (
    <EmptyState
      headingLevel={3}
      icon={<Icon icon="search" />}
      title={titles[state.status]}
      description="Annonserna hämtas från TED och e-Avrop varje morgon."
      actions={showOthers ?? undefined}
    />
  );
}

export interface NoticeResultsProps {
  state: ListState;
  query: UseQueryResult<NoticeList>;
  onChange: (changes: Partial<ListState>) => void;
}

/**
 * The list itself (direction.md, section 4 "Upphandlingar"): what is shown and in what order, the rows in one card,
 * and the pages. Changing page takes the reader to the top of the list, with the focus on the line that says what
 * is shown. A phone offers the order in the filter popover instead of beside that line, which keeps one line here.
 */
export function NoticeResults({ state, query, onChange }: NoticeResultsProps) {
  const isPhone = useIsPhone();
  const summaryRef = useRef<HTMLElement>(null);
  const { data } = query;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A page past the end (an old link, fewer notices now) goes to the last page instead of an empty list.
  const isPastEnd = query.isSuccess && !query.isPlaceholderData && state.page > pageCount;
  const sort = currentSort(state, data);

  useEffect(() => {
    if (isPastEnd) onChange({ page: pageCount });
  }, [isPastEnd, pageCount]);

  const goToPage = (page: number) => {
    onChange({ page });
    summaryRef.current?.focus({ preventScroll: true });
    summaryRef.current?.scrollIntoView?.({ block: "start" });
  };

  return (
    <VStack as="section" aria-labelledby={RESULTS_HEADING_ID} gap={2}>
      <VisuallyHidden>
        <Heading level={2} id={RESULTS_HEADING_ID}>
          Sökresultat
        </Heading>
      </VisuallyHidden>
      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
        <Text type="supporting" role="status" ref={summaryRef} tabIndex={-1}>
          {query.isSuccess && !isPastEnd
            ? resultText({
                total,
                status: state.status,
                q: state.q,
                buyer: state.buyer,
                isFitOnly: state.isFitOnly,
                sort,
              })
            : ""}
          {query.isPlaceholderData ? " · Uppdaterar …" : ""}
        </Text>
        {total > 1 && !isPhone && (
          <SortSelector value={sort} q={state.q} onChange={(next) => onChange({ sort: next })} />
        )}
      </HStack>

      {query.isPending && <Loading label="Hämtar upphandlingar …" />}
      {query.isError && (
        <ErrorNotice title="Upphandlingarna kunde inte hämtas" error={query.error} onRetry={() => query.refetch()} />
      )}
      {data && !isPastEnd && data.items.length === 0 && <NoResults state={state} data={data} onChange={onChange} />}
      {data && data.items.length > 0 && (
        <Card padding={0} aria-busy={query.isPlaceholderData || undefined}>
          <RowList label="Upphandlingar" isInset>
            {data.items.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} isStatusShown={state.status === "all"} />
            ))}
          </RowList>
        </Card>
      )}

      {pageCount > 1 && !isPastEnd && (
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <Text type="supporting" hasTabularNumbers>
            {rangeText(state.page, PAGE_SIZE, total)}
          </Text>
          <Pagination
            page={Math.min(state.page, pageCount)}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onChange={goToPage}
            label="Sidor i listan"
            siblingCount={isPhone ? 0 : 1}
          />
        </HStack>
      )}
    </VStack>
  );
}
