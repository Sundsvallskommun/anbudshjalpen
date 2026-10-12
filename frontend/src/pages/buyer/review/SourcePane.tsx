import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { documentFileUrl, usePage } from "../../../api/queries";
import type { Citation, DocumentInfo } from "../../../api/types";
import { DocumentIcon } from "../../../components/ui/icons";
import { PageText } from "../../../components/ui/source/PageText";
import { SOURCE_DIALOG_TITLE, sourceStatus } from "../../../components/ui/source/SourceDialog";
import { ErrorNotice, Loading } from "../../../components/states";
import { FictitiousToken } from "../../../components/tokens";
import { findQuote } from "../../../lib/highlight";
import { citationPage } from "../../../lib/labels";
import { isTransientError } from "../../../queryClient";
import { PaneToolsContext, type PaneTools } from "./forms/FormParts";

/** What the pane shows the source of: the selected row, or the item being edited with its citation as typed. */
export interface PaneFocus {
  /** Changes when another row is chosen, so the pane opens on that row's page. */
  key: string;
  claim: string;
  /** The row's group, as the line under the heading names it ("Krav på uppdraget · s. 4"). */
  group: string;
  citation: Pick<Citation, "page" | "quote" | "check" | "found_page" | "document" | "document_id"> | null;
}

export interface SourcePaneProps {
  noticeId: string;
  documentInfo: DocumentInfo | undefined;
  focus: PaneFocus | null;
  /** The form, while an item is edited, and its heading. */
  editor?: ReactNode;
  editorTitle?: string;
  onCitationChange: PaneTools["onCitationChange"];
}

/** The page a focus opens on: its citation's page within the document, else the first. */
function focusPage(focus: PaneFocus | null, pageCount: number): number {
  if (!focus?.citation) return 1;
  const page = citationPage(focus.citation);
  return page >= 1 && (pageCount <= 0 || page <= pageCount) ? page : 1;
}

/** Text marked inside an element, as one line: what "Använd markeringen som citat" takes. */
function selectedText(container: HTMLElement | null): string | null {
  const selection = document.getSelection();
  if (!container || !selection || selection.isCollapsed) return null;
  if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return null;
  const text = selection.toString().replace(/\s+/gu, " ").trim();
  return text || null;
}

function StatusLine({ status }: { status: NonNullable<ReturnType<typeof sourceStatus>> }) {
  return (
    <HStack gap={2} vAlign="start">
      <Icon
        icon={status.tone === "warning" ? "warning" : status.tone === "success" ? "success" : "info"}
        color={status.tone === "info" ? "accent" : status.tone}
        size="sm"
      />
      <Text weight="semibold">{status.text}</Text>
    </HStack>
  );
}

function DocumentLine({ documentInfo }: { documentInfo: DocumentInfo }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Icon icon={DocumentIcon} size="sm" color="secondary" />
      <Text type="supporting" color="primary" weight="medium">
        {documentInfo.filename}
      </Text>
      {documentInfo.is_fictitious && <FictitiousToken size="sm" />}
      <Link
        as="a"
        href={documentFileUrl(documentInfo.id)}
        download
        size="sm"
        label={`Ladda ned ${documentInfo.filename}`}
      >
        Ladda ned
      </Link>
    </HStack>
  );
}

/** The heading, the "group · s. 4" line, the form and the empty state: the pane's parts above the page. */
function PaneTop({
  focus,
  citation,
  editor,
  editorTitle,
  tools,
}: Pick<SourcePaneProps, "focus" | "editor" | "editorTitle"> & {
  citation: PaneFocus["citation"];
  tools: PaneTools | null;
}) {
  const where = !focus
    ? null
    : citation
      ? `${focus.group} · s. ${citationPage(citation)}`
      : `${focus.group} · ingen källhänvisning`;
  return (
    <>
      <HStack gap={1} vAlign="center" hAlign="between" wrap="wrap">
        <Heading level={2}>{SOURCE_DIALOG_TITLE}</Heading>
        {where && <Text type="supporting">{where}</Text>}
      </HStack>
      {editor && (
        <Section variant="muted" padding={4} data-pane-editor="">
          <VStack gap={3}>
            {editorTitle && <Heading level={3}>{editorTitle}</Heading>}
            <PaneToolsContext value={tools}>{editor}</PaneToolsContext>
          </VStack>
        </Section>
      )}
      {!focus && !editor && (
        <EmptyState
          isCompact
          title="Välj en rad i listan"
          description="Här visas sidan i underlaget som raden bygger på, med citatet markerat."
        />
      )}
    </>
  );
}

/** The pane with the document: the page shown, its quote marked, and the tools the form beside it uses. */
function DocumentPane({
  noticeId,
  documentInfo,
  focus,
  editor,
  editorTitle,
  onCitationChange,
}: SourcePaneProps & { documentInfo: DocumentInfo }) {
  const pageCount = documentInfo.page_count;
  const citation = focus?.citation ?? null;
  const anchor = `${focus?.key ?? ""}:${citation ? citationPage(citation) : ""}`;
  const [shown, setShown] = useState(() => ({ anchor, page: focusPage(focus, pageCount) }));
  if (shown.anchor !== anchor) setShown({ anchor, page: focusPage(focus, pageCount) });
  const page = shown.page;

  const query = usePage(noticeId, documentInfo.id, page);
  const text = query.data?.text ?? "";
  const onCitedPage = citation !== null && page === citationPage(citation);
  const quote = onCitedPage && citation.check !== "unverified" ? citation.quote.trim() : "";
  const range = useMemo(() => (quote.length >= 3 && text ? findQuote(text, quote) : null), [text, quote]);
  const marked = quote.length >= 3 && query.isSuccess ? range !== null : null;
  // Said once the page is there, so choosing a row is announced once, with what the reader will find below.
  const status =
    citation && citation.quote.trim().length >= 3 && (query.isSuccess || citation.check === "unverified")
      ? sourceStatus(citation, marked, pageCount)
      : null;

  const paperRef = useRef<HTMLDivElement>(null);
  const selection = useRef<{ text: string; page: number } | null>(null);
  useEffect(() => {
    selection.current = null;
    const onSelectionChange = () => {
      const picked = selectedText(paperRef.current);
      if (picked) selection.current = { text: picked, page };
      else if (paperRef.current?.contains(document.getSelection()?.anchorNode ?? null)) selection.current = null;
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [page]);

  const readSelection = useCallback(() => selection.current, []);
  const tools = useMemo<PaneTools>(
    () => ({ readSelection, quoteFound: onCitedPage ? marked : null, onCitationChange }),
    [readSelection, onCitedPage, marked, onCitationChange],
  );

  return (
    <VStack gap={4} padding={4}>
      <PaneTop focus={focus} citation={citation} editor={editor} editorTitle={editorTitle} tools={tools} />
      <VStack gap={3}>
        {focus && !citation && !editor && (
          <Text color="secondary">Raden har ingen källhänvisning. Bläddra i underlaget för att kontrollera den.</Text>
        )}
        <VStack role="status" gap={0}>
          {status && <StatusLine status={status} />}
        </VStack>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={3}>{`Sida ${page} av ${pageCount}`}</Heading>
          {pageCount > 1 && (
            <Pagination
              page={page}
              totalPages={pageCount}
              onChange={(next) => setShown({ anchor, page: next })}
              variant="none"
              size="sm"
              label="Bläddra i underlaget"
            />
          )}
        </HStack>
        <DocumentLine documentInfo={documentInfo} />
        {query.isPending && <Loading label="Hämtar sidan …" />}
        {query.isError && (
          <ErrorNotice
            title="Sidan kunde inte visas"
            error={query.error}
            onRetry={isTransientError(query.error) ? () => query.refetch() : undefined}
          />
        )}
        {query.isSuccess && (
          <VStack ref={paperRef} gap={0}>
            <PageText text={text} range={range} headingLevel={4} label={`Sida ${page} av ${pageCount} i underlaget`} />
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}

/**
 * The page beside the list (direction.md, section 4 "Granskningsbord"): the chosen row's page with its quote marked,
 * pages to leaf through, and, while an item is edited, the form above the page. The form's source is followed as it
 * is typed, and text marked on the page can become its quote. The status line is a polite live region, so choosing a
 * row tells a screen reader what the check found.
 */
export function SourcePane(props: SourcePaneProps) {
  if (props.documentInfo) return <DocumentPane {...props} documentInfo={props.documentInfo} />;
  return (
    <VStack gap={4} padding={4}>
      <PaneTop
        focus={props.focus}
        citation={props.focus?.citation ?? null}
        editor={props.editor}
        editorTitle={props.editorTitle}
        tools={null}
      />
      <Text color="secondary">Underlaget finns inte längre hos upphandlingen, så sidan kan inte visas här.</Text>
    </VStack>
  );
}
