import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { createContext, use, useCallback, useState, type ReactNode } from "react";
import type { Citation, DocumentInfo } from "../../api/types";
import { citationStatus } from "../../lib/labels";
import { citationPage } from "./citation";
import { PageViewer } from "./PageViewer";

export interface CitationTarget {
  documentId: string;
  citation: Citation;
}

const OpenCitationContext = createContext<((target: CitationTarget) => void) | null>(null);

/** Opens the page viewer for a citation; null outside a CitationViewerProvider. */
export function useOpenCitation() {
  return use(OpenCitationContext);
}

/** Whether the AI's page is past the end of the document; such a citation opens on page 1. */
function isPastEnd(citation: Citation, pageCount: number | undefined): pageCount is number {
  return pageCount !== undefined && pageCount > 0 && citationPage(citation) > pageCount;
}

/** The page a citation opens on: its own, or page 1 when that page does not exist in the document. */
export function openingPage(citation: Citation, pageCount: number | undefined): number {
  return isPastEnd(citation, pageCount) ? 1 : Math.max(1, citationPage(citation));
}

/**
 * What verification found, in words, above the page. `marked` says whether the quote is marked on the page
 * shown (null while the cited page is not the one shown or has not loaded), so the notice never promises a
 * mark the reader cannot see: the backend accepts small differences in wording that a mark cannot follow.
 */
function VerificationNotice({
  citation,
  marked,
  pageCount,
}: {
  citation: Citation;
  marked: boolean | null;
  pageCount: number | undefined;
}) {
  const quote = <Text>”{citation.quote}”</Text>;
  if (citation.check === "verified") {
    const where = `Citatet står på sida ${citation.page} i underlaget`;
    const description =
      marked === true
        ? `${where} och är markerat nedan.`
        : marked === false
          ? `${where}, men AI:n har återgett det med lite andra ord, så det går inte att markera. Läs sidan nedan.`
          : `${where}.`;
    return (
      <Banner status="success" title={citationStatus("verified")} description={description} collapsible={false}>
        {quote}
      </Banner>
    );
  }
  if (citation.check === "moved") {
    const where = `AI:n angav sida ${citation.page}, men citatet står på sida ${citationPage(citation)}.`;
    const description =
      marked === true
        ? `${where} Den sidan visas nedan med citatet markerat.`
        : marked === false
          ? `${where} Den sidan visas nedan, men citatet går inte att markera där.`
          : where;
    return (
      <Banner status="info" title={citationStatus("moved")} description={description} collapsible={false}>
        {quote}
      </Banner>
    );
  }
  const description = isPastEnd(citation, pageCount)
    ? `Citatet hittades inte i underlaget. AI:n angav sida ${citation.page}, men underlaget har bara ${pageCount} sidor. Kontrollera uppgiften i underlaget innan du litar på den.`
    : `Citatet hittades inte i underlaget. Det kan vara omformulerat eller fel. Läs sida ${citation.page} och kontrollera uppgiften innan du litar på den.`;
  return (
    <Banner status="warning" title={citationStatus(citation.check)} description={description} collapsible={false}>
      {quote}
    </Banner>
  );
}

/**
 * Owns the page viewer dialog for one notice's documents. Citation chips anywhere below it open the
 * dialog on the cited page with the quote marked. The open citation and page live here, above the
 * dialog, so closing it loses nothing the page needs.
 */
export function CitationViewerProvider({
  noticeId,
  documents,
  children,
}: {
  noticeId: string;
  documents: DocumentInfo[];
  children: ReactNode;
}) {
  const [target, setTarget] = useState<CitationTarget | null>(null);
  const [page, setPage] = useState(1);

  const open = useCallback(
    (next: CitationTarget) => {
      const count = documents.find((document) => document.id === next.documentId)?.page_count;
      setTarget(next);
      setPage(openingPage(next.citation, count));
    },
    [documents],
  );
  const close = useCallback((isOpen: boolean) => {
    if (!isOpen) setTarget(null);
  }, []);

  const document = documents.find((candidate) => candidate.id === target?.documentId);
  // Only a quote verification found is marked, and only on the page it was found on.
  const check = target?.citation.check;
  const quote =
    target && (check === "verified" || check === "moved") && page === citationPage(target.citation)
      ? target.citation.quote
      : null;
  return (
    <OpenCitationContext value={open}>
      {children}
      <Dialog isOpen={target !== null} onOpenChange={close} width={760}>
        {/* The header is always mounted: the dialog takes its accessible name from the title. */}
        <Layout
          header={<DialogHeader title="Källan i underlaget" subtitle={document?.filename} onOpenChange={close} />}
          content={
            target && (
              <LayoutContent>
                <PageViewer
                  noticeId={noticeId}
                  documentId={target.documentId}
                  page={page}
                  pageCount={document?.page_count}
                  onPageChange={setPage}
                  quote={quote}
                  renderNotice={(marked) => (
                    <VerificationNotice citation={target.citation} marked={marked} pageCount={document?.page_count} />
                  )}
                />
              </LayoutContent>
            )
          }
        />
      </Dialog>
    </OpenCitationContext>
  );
}
