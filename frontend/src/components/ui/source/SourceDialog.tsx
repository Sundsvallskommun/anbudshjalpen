import { Blockquote } from "@astryxdesign/core/Blockquote";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useLocation } from "react-router";
import { documentFileUrl, useNotice, usePage, useSession } from "../../../api/queries";
import type { Citation, DocumentInfo, NoticeDetail } from "../../../api/types";
import { formatShortDate, plural } from "../../../lib/format";
import { findQuote } from "../../../lib/highlight";
import { keyDateIndex } from "../../../lib/keyDates";
import { citationPage } from "../../../lib/labels";
import { useIsPhone } from "../../../lib/usePhone";
import { isTransientError } from "../../../queryClient";
import { ErrorNotice, Loading } from "../../states";
import { TermText } from "../../TermText";
import { FictitiousToken } from "../../tokens";
import { DocumentIcon } from "../icons";
import { PageText } from "./PageText";
import { primaryDocumentId, type DialogTarget } from "./sourceTarget";

export const SOURCE_DIALOG_TITLE = "Källan i underlaget";
const DOCUMENT_DIALOG_TITLE = "Underlaget";

/** Whether the AI's page is past the end of the document; such a citation opens on page 1. */
function isPastEnd(citation: Citation, pageCount: number | undefined): pageCount is number {
  return pageCount !== undefined && pageCount > 0 && citationPage(citation) > pageCount;
}

/** The page a target opens on: the citation's own (or page 1 when it does not exist), or the asked-for page. */
export function openingPage(target: DialogTarget, pageCount: number | undefined): number {
  if (target.kind === "document") return Math.max(1, target.page ?? 1);
  return isPastEnd(target.citation, pageCount) ? 1 : Math.max(1, citationPage(target.citation));
}

type StatusTone = "success" | "info" | "warning";

/**
 * What the check found, in words (direction.md, section 4): where the quote is and whether it is marked below.
 * `marked` is null while the cited page is not shown or has not loaded, so the line never promises a mark the
 * reader cannot see: the backend accepts small differences in wording that a mark cannot follow.
 */
export function sourceStatus(
  citation: Citation,
  marked: boolean | null,
  pageCount: number | undefined,
): { tone: StatusTone; text: string } | null {
  const page = citationPage(citation);
  if (citation.check === "unverified") {
    return {
      tone: "warning",
      text: isPastEnd(citation, pageCount)
        ? `Citatet hittades inte i underlaget. AI:n angav sida ${citation.page}, men underlaget har bara ${pageCount} sidor. Sida 1 visas.`
        : `Citatet hittades inte i underlaget. Sida ${citation.page} visas utan markering.`,
    };
  }
  if (citation.check === "moved") {
    const where = `Citatet står på sida ${page} (AI angav ${citation.page})`;
    if (marked === true) return { tone: "info", text: `${where} och är markerat nedan.` };
    if (marked === false) return { tone: "info", text: `${where}, men går inte att markera där. Läs sidan nedan.` };
    return { tone: "info", text: `${where}.` };
  }
  if (citation.check === "verified") {
    const where = `Citatet står på sida ${page}`;
    if (marked === true) return { tone: "success", text: `${where} och är markerat nedan.` };
    if (marked === false) {
      return { tone: "info", text: `${where}, men med lite andra ord, så det går inte att markera. Läs sidan nedan.` };
    }
    return { tone: "success", text: `${where}.` };
  }
  // A quote from an address that the notice does not list: only what the page shows can be said.
  if (marked === true) return { tone: "success", text: `Citatet står på sida ${page} och är markerat nedan.` };
  if (marked === false) return { tone: "warning", text: `Citatet hittades inte på sida ${page}. Kontrollera uppgiften i underlaget.` };
  return null;
}

const TONE_ICON: Record<StatusTone, "success" | "info" | "warning"> = { success: "success", info: "info", warning: "warning" };

function StatusLine({ status }: { status: { tone: StatusTone; text: string } }) {
  return (
    <HStack gap={2} vAlign="start">
      <Icon icon={TONE_ICON[status.tone]} color={status.tone === "info" ? "accent" : status.tone} size="md" />
      <Text weight="semibold">{status.text}</Text>
    </HStack>
  );
}

function Claim({ claim, origin, noticeTitle }: { claim: string; origin?: string; noticeTitle?: string }) {
  const from = [origin, noticeTitle].filter(Boolean).join(" · ");
  return (
    <Section variant="muted" padding={3}>
      <VStack gap={1}>
        <Text type="supporting">Påståendet</Text>
        <Text>{claim}</Text>
        {from && <Text type="supporting">{`Från: ${from}`}</Text>}
      </VStack>
    </Section>
  );
}

function DocumentRow({ document }: { document: DocumentInfo }) {
  return (
    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Icon icon={DocumentIcon} size="sm" color="secondary" />
        <Text weight="medium">{document.filename}</Text>
        <Text type="supporting">{plural(document.page_count, "sida", "sidor")}</Text>
        {document.is_fictitious && <FictitiousToken size="sm" />}
      </HStack>
      <Link as="a" href={documentFileUrl(document.id)} download isStandalone label="Ladda ned underlaget">
        Ladda ned
      </Link>
    </HStack>
  );
}

/** The page shown, with the quote marked when the check found it on this page. */
function SourcePage({
  noticeId,
  document,
  target,
  page,
  onPageChange,
}: {
  noticeId: string;
  document: DocumentInfo;
  target: DialogTarget;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const query = usePage(noticeId, document.id, page);
  const citation = target.kind === "source" ? target.citation : null;
  // Only a quote the check found (or one an address gave, which the page alone can confirm) is marked, and only on
  // the page it was found on.
  const quote = citation && citation.check !== "unverified" && page === citationPage(citation) ? citation.quote : null;
  const text = query.data?.text ?? "";
  const range = useMemo(() => (quote ? findQuote(text, quote) : null), [text, quote]);
  const marked = quote && query.isSuccess ? range !== null : null;
  const pageCount = query.data?.page_count ?? document.page_count;
  const status = citation ? sourceStatus(citation, marked, document.page_count) : null;

  return (
    <VStack gap={4}>
      {status && <StatusLine status={status} />}
      {/* The cited words, whenever the page below does not show them marked: not found, worded differently, or
          the reader has leafed to another page. */}
      {citation && marked !== true && <Blockquote cite="Citatet som AI:n angav">{`”${citation.quote}”`}</Blockquote>}
      <VStack gap={2}>
        <DocumentRow document={document} />
        {pageCount > 0 && (
          <Pagination
            page={page}
            totalPages={pageCount}
            onChange={onPageChange}
            variant="compact"
            size="sm"
            label="Sidor i underlaget"
          />
        )}
      </VStack>
      {query.isPending && <Loading label="Hämtar sidan …" />}
      {query.isError && (
        <ErrorNotice
          title="Sidan kunde inte visas"
          error={query.error}
          onRetry={isTransientError(query.error) ? () => query.refetch() : undefined}
        />
      )}
      {query.isSuccess && <PageText text={text} range={range} label={`Sida ${page} av ${pageCount} i underlaget`} />}
    </VStack>
  );
}

/** "… Ställ frågan i e-Avrop senast 30 okt.": the formal way to an answer every supplier gets (likabehandling). */
function questionAdvice(notice: NoticeDetail | undefined): string {
  const checklist = notice?.checklist?.status === "published" ? notice.checklist.checklist : null;
  const date = checklist ? checklist.dates[keyDateIndex(checklist, "fragestopp")]?.date : null;
  const when = date ? ` senast ${formatShortDate(date)}` : " före frågestoppet";
  return `Stämmer det inte? Det är alltid förfrågningsunderlaget som gäller. Ställ frågan i e-Avrop${when}.`;
}

function DialogBody({
  target,
  page,
  onPageChange,
}: {
  target: DialogTarget;
  /** The page the reader leafed to, or null for the target's opening page. */
  page: number | null;
  onPageChange: (page: number) => void;
}) {
  const notice = useNotice(target.noticeId);
  if (notice.isPending) return <Loading label="Hämtar underlaget …" />;
  if (notice.isError) {
    return <ErrorNotice title="Underlaget kunde inte hämtas" error={notice.error} onRetry={() => notice.refetch()} />;
  }
  const documentId = target.documentId ?? primaryDocumentId(notice.data);
  const document = notice.data.documents.find((candidate) => candidate.id === documentId);
  return (
    <VStack gap={4}>
      {target.kind === "source" && target.claim && (
        <Claim claim={target.claim} origin={target.origin} noticeTitle={notice.data.title} />
      )}
      {document ? (
        <SourcePage
          noticeId={target.noticeId}
          document={document}
          target={target}
          page={page ?? openingPage(target, document.page_count)}
          onPageChange={onPageChange}
        />
      ) : (
        <Text>Underlaget finns inte längre hos upphandlingen. Läs annonsen för att hitta det.</Text>
      )}
    </VStack>
  );
}

function DialogFooter({ target, onClose }: { target: DialogTarget; onClose: () => void }) {
  const { pathname } = useLocation();
  const session = useSession();
  const notice = useNotice(target.noticeId);
  const noticePath = `/upphandlingar/${target.noticeId}`;
  const isBuyer = session.data?.user?.role === "inkopare";
  return (
    <VStack gap={3}>
      {!isBuyer && <TermText text={questionAdvice(notice.data)} />}
      <HStack gap={2} hAlign="end" vAlign="center" wrap="wrap">
        {pathname !== noticePath && <Button label="Öppna upphandlingen" variant="ghost" href={noticePath} />}
        <Button label="Stäng" onClick={onClose} />
      </HStack>
    </VStack>
  );
}

export interface SourceDialogProps {
  target: DialogTarget | null;
  /** The page the reader leafed to, or null for the target's opening page (decided once the document is known). */
  page: number | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
  /** The control that opened the dialog, for the bottom sheet to return focus to. */
  openerRef: RefObject<HTMLElement | null>;
}

function SheetHeading({ title, isOpen }: { title: string; isOpen: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Focus moves to the title, as in the dialog (WCAG 3.2.4: the same control behaves the same everywhere).
  useEffect(() => {
    if (isOpen) ref.current?.focus();
  }, [isOpen]);
  return (
    <Heading level={2} ref={ref} tabIndex={-1}>
      {title}
    </Heading>
  );
}

/**
 * The source of a claim: a 760 px dialog on desktop and a bottom sheet on a phone, with the same content. Focus moves
 * to the title and back to the "s. N" that opened it. Rendered once by SourceDialogProvider; open it with
 * useSourceDialog().
 */
export function SourceDialog({ target, page, onPageChange, onClose, openerRef }: SourceDialogProps) {
  const isPhone = useIsPhone();
  const isOpen = target !== null;
  const title = target?.kind === "document" ? DOCUMENT_DIALOG_TITLE : SOURCE_DIALOG_TITLE;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const body: ReactNode = target && <DialogBody target={target} page={page} onPageChange={onPageChange} />;
  const footer: ReactNode = target && <DialogFooter target={target} onClose={onClose} />;

  if (isPhone) {
    return (
      <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label={title} height="tall" finalFocusRef={openerRef}>
        <VStack gap={4} padding={4}>
          <SheetHeading title={title} isOpen={isOpen} />
          {body}
          {footer}
        </VStack>
      </BottomSheet>
    );
  }
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={760} maxHeight="90dvh">
      {/* The header is always mounted: the dialog takes its accessible name from the title. */}
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={body ? <LayoutContent>{body}</LayoutContent> : undefined}
        footer={footer ? <LayoutFooter>{footer}</LayoutFooter> : undefined}
      />
    </Dialog>
  );
}
