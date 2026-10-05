import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useNotices, useSession, type NoticeFilters } from "../api/queries";
import type { NoticeStatus } from "../api/types";
import { NoticeRow } from "../components/NoticeRow";
import { Row, RowList } from "../components/RowList";
import { ErrorNotice, Loading } from "../components/states";
import { plural } from "../lib/format";
import { useDebouncedValue } from "../lib/hooks";
import { Page } from "../shell/Page";

const PAGE_SIZE = 20;
const ALL = "alla";

const STATUS_OPTIONS = [
  { value: ALL, label: "Alla" },
  { value: "open", label: "Öppna för anbud" },
  { value: "planned", label: "Planerade" },
  { value: "awarded", label: "Tilldelade" },
  { value: "closed", label: "Stängda" },
];

const SOURCE_OPTIONS = [
  { value: ALL, label: "Alla källor" },
  { value: "eavrop", label: "e-Avrop" },
  { value: "ted", label: "TED" },
  { value: "fixture", label: "Demo" },
  { value: "manual", label: "Inlagd av inköp" },
];

const STATUSES = new Set<string>(["open", "planned", "awarded", "closed"]);

/** The filters live in the address, so a search can be shared, bookmarked and reloaded. */
function useNoticeFilters() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? ALL;
  const source = params.get("kalla") ?? ALL;
  const page = Math.max(1, Number.parseInt(params.get("sida") ?? "1", 10) || 1);

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "" || value === ALL) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const filters: NoticeFilters = {
    q: q || undefined,
    status: STATUSES.has(status) ? (status as NoticeStatus) : undefined,
    source: source === ALL ? undefined : source,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  return { q, status, source, page, filters, update };
}

export function NoticesPage() {
  const { q, status, source, page, filters, update } = useNoticeFilters();
  const [text, setText] = useState(q);
  const debouncedText = useDebouncedValue(text, 300);
  // The search text this page last put in the address; any other `q` came from outside (a link, back).
  const ownQ = useRef(q);
  const session = useSession();
  const notices = useNotices(filters);

  useEffect(() => {
    const next = debouncedText.trim();
    if (next === q) return;
    ownQ.current = next;
    update({ q: next, sida: null });
    // Only the typed text drives this; `q` follows it through the address.
  }, [debouncedText]);

  useEffect(() => {
    if (q === ownQ.current) return;
    ownQ.current = q;
    setText(q);
  }, [q]);

  const isCompany = session.data?.user?.role === "foretagare";
  const total = notices.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || filters.status || filters.source);
  // A page past the end (an old link, fewer notices now) goes to the last page instead of an empty list.
  const isPastEnd = notices.isSuccess && !notices.isPlaceholderData && page > pageCount;

  useEffect(() => {
    if (isPastEnd) update({ sida: pageCount > 1 ? String(pageCount) : null });
  }, [isPastEnd, pageCount]);

  const clearFilters = () => {
    setText("");
    update({ q: null, status: null, kalla: null, sida: null });
  };

  return (
    <Page
      title="Upphandlingar"
      intro={
        isCompany
          ? "Kommunens upphandlingar. Markeringen Passar, Passar delvis eller Passar inte bygger på er företagsprofil."
          : "Kommunens annonserade och planerade upphandlingar. Öppna en upphandling för att se checklistan, ställa frågor om underlaget och granska ditt anbudsutkast."
      }
    >
      <VStack gap={4}>
        <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
          <TextInput
            label="Sök"
            value={text}
            onChange={setText}
            startIcon="search"
            hasClear
            placeholder="Till exempel målning eller städning"
          />
          <Selector
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(value) => update({ status: value, sida: null })}
          />
          <Selector
            label="Källa"
            options={SOURCE_OPTIONS}
            value={source}
            onChange={(value) => update({ kalla: value, sida: null })}
          />
        </Grid>

        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <Text weight="semibold" role="status">
            {notices.isSuccess ? plural(total, "upphandling", "upphandlingar") : ""}
          </Text>
          {notices.isPlaceholderData && <Text color="secondary">Uppdaterar …</Text>}
        </HStack>

        {notices.isPending && <Loading label="Hämtar upphandlingar …" />}
        {notices.isError && (
          <ErrorNotice
            title="Upphandlingarna kunde inte hämtas"
            error={notices.error}
            onRetry={() => notices.refetch()}
          />
        )}
        {notices.isSuccess && !isPastEnd && notices.data.items.length === 0 && (
          <EmptyState
            headingLevel={2}
            icon={<Icon icon="search" />}
            title={hasFilters ? "Inga upphandlingar matchar sökningen" : "Inga upphandlingar ännu"}
            description={
              hasFilters
                ? "Prova ett annat sökord eller ta bort ett filter."
                : "Annonserna hämtas från TED och e-Avrop varje morgon."
            }
            actions={hasFilters ? <Button label="Rensa filter" onClick={clearFilters} /> : undefined}
          />
        )}
        {notices.isSuccess && notices.data.items.length > 0 && (
          <RowList label="Upphandlingar">
            {notices.data.items.map((notice) => (
              <Row key={notice.id}>
                <NoticeRow notice={notice} />
              </Row>
            ))}
          </RowList>
        )}

        {pageCount > 1 && !isPastEnd && (
          <HStack gap={3} vAlign="center" hAlign="center" wrap="wrap">
            <Button
              label="Föregående sida"
              icon={<Icon icon="chevronLeft" />}
              isDisabled={page <= 1}
              onClick={() => update({ sida: String(page - 1) })}
            />
            <Text>{`Sida ${page} av ${pageCount}`}</Text>
            <Button
              label="Nästa sida"
              icon={<Icon icon="chevronRight" />}
              isDisabled={page >= pageCount}
              onClick={() => update({ sida: String(page + 1) })}
            />
          </HStack>
        )}
      </VStack>
    </Page>
  );
}
