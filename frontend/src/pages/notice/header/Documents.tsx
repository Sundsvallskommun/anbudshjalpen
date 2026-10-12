import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { documentFileUrl } from "../../../api/queries";
import type { DocumentInfo, NoticeDetail } from "../../../api/types";
import { DocumentIcon, DownloadIcon } from "../../../components/ui/icons";
import { useSourceDialog } from "../../../components/ui/source/SourceDialogProvider";
import { plural } from "../../../lib/format";
import { externalLink, type LinkSite } from "../../../lib/links";
import { primaryDocumentId } from "../noticeData";

/** Words for a link to documents kept outside the app: "Underlaget i e-Avrop", or "Öppna underlaget" elsewhere. */
export function outsideDocumentsText(site: LinkSite): string {
  return site === "eavrop" ? "Underlaget i e-Avrop" : "Öppna underlaget";
}

/** "Underlaget · 17 sidor", or only "Underlaget" before the pages are known. */
function documentWords(document: DocumentInfo): { shown: string; name: string } {
  if (document.page_count <= 0) return { shown: "Underlaget", name: "Underlaget" };
  const pages = plural(document.page_count, "sida", "sidor");
  return { shown: `Underlaget · ${pages}`, name: `Underlaget, ${pages}` };
}

/** "3 sidor utan läsbar text": pages the AI never saw (scans, images), so the reader checks those in the file. */
export function emptyPagesText(document: DocumentInfo): string | null {
  if (document.empty_pages <= 0) return null;
  return document.page_count > 0 && document.empty_pages === document.page_count
    ? "ingen läsbar text, troligen inskannad"
    : `${plural(document.empty_pages, "sida", "sidor")} utan läsbar text`;
}

/** "Ladda ned" with its icon, named by what it saves ("Ladda ned underlaget"); a plain anchor, past the router. */
function DownloadLink({ document, name }: { document: DocumentInfo; name: string }) {
  return (
    <Link as="a" href={documentFileUrl(document.id)} download isStandalone label={name}>
      <HStack as="span" gap={1} vAlign="center">
        <Icon icon={DownloadIcon} size="sm" />
        Ladda ned
      </HStack>
    </Link>
  );
}

/**
 * The procurement document as a reference beside the steps (direction.md, section 2: "Underlag blir en länk i
 * sidhuvudet"): it opens the source dialog on page 1, with "Ladda ned" for the original. A notice whose documents are
 * only in e-Avrop links there instead.
 */
export function DocumentLinks({ notice }: { notice: NoticeDetail }) {
  const { openDocument } = useSourceDialog();
  const documentId = primaryDocumentId(notice);
  const document = notice.documents.find((candidate) => candidate.id === documentId);
  if (!document) {
    const outside = externalLink(notice.documents_url);
    if (!outside) return null;
    return (
      <Link href={outside.href} isExternalLink isStandalone>
        {outsideDocumentsText(outside.site)}
      </Link>
    );
  }
  const words = documentWords(document);
  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      <Button
        label={words.name}
        variant="ghost"
        icon={<Icon icon={DocumentIcon} />}
        aria-haspopup="dialog"
        onClick={() => openDocument({ noticeId: notice.id, documentId: document.id, page: 1 })}
      >
        {words.shown}
      </Button>
      <DownloadLink document={document} name="Ladda ned underlaget" />
    </HStack>
  );
}

/** One document: its file name, pages and the made-up mark, with "Öppna" (the source dialog) and "Ladda ned". */
export function DocumentItem({ notice, document }: { notice: NoticeDetail; document: DocumentInfo }) {
  const { openDocument } = useSourceDialog();
  return (
    <HStack as="li" gap={3} vAlign="start">
      <Icon icon={DocumentIcon} size="md" color="secondary" />
      <VStack gap={2} hAlign="start">
        <VStack gap={0.5}>
          <Text weight="medium">{document.filename}</Text>
          <Text type="supporting">
            {[
              document.page_count > 0 ? plural(document.page_count, "sida", "sidor") : null,
              emptyPagesText(document),
              document.is_fictitious ? "Fiktiv" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </VStack>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Button
            label={`Öppna underlaget ${document.filename}`}
            size="sm"
            aria-haspopup="dialog"
            onClick={() => openDocument({ noticeId: notice.id, documentId: document.id, page: 1 })}
          >
            Öppna underlaget
          </Button>
          <DownloadLink document={document} name={`Ladda ned ${document.filename}`} />
        </HStack>
      </VStack>
    </HStack>
  );
}

/** The notice's documents as a list. */
export function DocumentList({ notice }: { notice: NoticeDetail }) {
  if (notice.documents.length === 0) return null;
  return (
    <VStack as="ul" role="list" aria-label="Dokument" gap={3}>
      {notice.documents.map((document) => (
        <DocumentItem key={document.id} notice={notice} document={document} />
      ))}
    </VStack>
  );
}

/**
 * The files the source lists that Anbudshjälpen could not read in (decision 0020), with the reason, so the documents
 * here are never taken for the whole set: a price list in Excel the AI never saw is still part of the procurement.
 */
export function UnreadFiles({ notice }: { notice: NoticeDetail }) {
  if (notice.unread_files.length === 0) return null;
  const outside = externalLink(notice.documents_url);
  return (
    <VStack gap={2} hAlign="start">
      <Text weight="semibold">Finns hos köparen men inte här</Text>
      <Text type="supporting">
        Anbudshjälpen kunde inte läsa in de här filerna, så varken checklistan, Fråga AI eller sökningen känner till
        dem. Läs dem i originalet.
      </Text>
      <VStack as="ul" role="list" aria-label="Filer som inte lästs in" gap={1}>
        {notice.unread_files.map((file) => (
          <HStack as="li" key={file.filename} gap={2} vAlign="start">
            <Text>{`${file.filename} · ${file.reason}`}</Text>
          </HStack>
        ))}
      </VStack>
      {outside && (
        <Link href={outside.href} isExternalLink isStandalone>
          {outsideDocumentsText(outside.site)}
        </Link>
      )}
    </VStack>
  );
}
