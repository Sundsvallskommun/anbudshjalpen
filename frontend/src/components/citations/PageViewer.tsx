import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePage } from "../../api/queries";
import { findQuote, splitAtRange } from "../../lib/highlight";
import { isTransientError } from "../../queryClient";
import { ErrorNotice, Loading } from "../states";
import styles from "./PageViewer.module.css";

/**
 * One page of a procurement document as text, with the cited quote marked and scrolled into view, and
 * buttons to leaf through the document. The page shown is the caller's state, so a dialog or a tab can
 * keep it in the address or across opening and closing.
 *
 * `renderNotice` lets the caller say what verification found, knowing whether the quote could be marked
 * (null while there is no quote or no page); the viewer then leaves the explaining to it.
 */
export function PageViewer({
  noticeId,
  documentId,
  page,
  pageCount: knownPageCount,
  onPageChange,
  quote,
  renderNotice,
}: {
  noticeId: string;
  documentId: string;
  page: number;
  /** The document's page count, when the caller knows it, so leafing works before a page has loaded. */
  pageCount?: number;
  onPageChange: (page: number) => void;
  quote?: string | null;
  renderNotice?: (marked: boolean | null) => ReactNode;
}) {
  const query = usePage(noticeId, documentId, page);
  const markRef = useRef<HTMLElement>(null);
  const text = query.data?.text ?? "";
  const range = useMemo(() => (quote ? findQuote(text, quote) : null), [text, quote]);
  const marked = quote && query.isSuccess ? range !== null : null;

  useEffect(() => {
    markRef.current?.scrollIntoView?.({ block: "center" });
  }, [range]);

  const pageCount = query.data?.page_count ?? knownPageCount;
  return (
    <VStack gap={3}>
      {renderNotice?.(marked)}
      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
        <Text weight="semibold" aria-live="polite">
          {pageCount ? `Sida ${page} av ${pageCount}` : `Sida ${page}`}
        </Text>
        <HStack gap={2}>
          <Button
            label="Föregående sida"
            size="sm"
            icon={<Icon icon="chevronLeft" />}
            isDisabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          />
          <Button
            label="Nästa sida"
            size="sm"
            icon={<Icon icon="chevronRight" />}
            isDisabled={pageCount === undefined || page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          />
        </HStack>
      </HStack>
      {query.isPending && <Loading label="Hämtar sidan …" />}
      {query.isError && (
        <ErrorNotice
          title="Sidan kunde inte visas"
          error={query.error}
          onRetry={isTransientError(query.error) ? () => query.refetch() : undefined}
        />
      )}
      {query.isSuccess && (
        <>
          {marked === false && !renderNotice && (
            <Text color="secondary">Citatet går inte att markera på den här sidan.</Text>
          )}
          <pre className={styles.page}>
            {splitAtRange(text, range).map((segment, index) =>
              segment.isMatch ? (
                <mark key={index} ref={markRef} className={styles.mark}>
                  {segment.text}
                </mark>
              ) : (
                segment.text
              ),
            )}
          </pre>
        </>
      )}
    </VStack>
  );
}
