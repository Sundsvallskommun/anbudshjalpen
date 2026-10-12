import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeDetail, UserView } from "../../../api/types";
import { DocumentUpload } from "../../../components/DocumentUpload";
import { TermText } from "../../../components/TermText";
import { formatShortDate } from "../../../lib/format";
import { externalLink, noticeLinkText } from "../../../lib/links";
import { cpvNames } from "../noticeData";
import { DocumentList, outsideDocumentsText, UnreadFiles } from "./Documents";

/**
 * The rest of the notice, behind "Om upphandlingen" (direction.md, section 4): the description, what is bought in the
 * CPV list's words, when it was published, where, and the notice's own page. `showsDocuments` adds the documents (the
 * phone, where the header has no document link; or when there are several). A buyer can add a document here.
 */
export function AboutNotice({
  notice,
  user,
  showsDocuments,
}: {
  notice: NoticeDetail;
  user: UserView | null;
  showsDocuments: boolean;
}) {
  const cpv = cpvNames(notice);
  const page = externalLink(notice.url);
  const documentsPage = externalLink(notice.documents_url);
  const hasFacts = cpv.length > 0 || notice.published_at !== null || notice.place !== null;
  return (
    <VStack gap={4}>
      {notice.description && (
        // Prose keeps the content column's measure, also when the panel spans the page.
        <VStack maxWidth="var(--layout-main)">
          <TermText text={notice.description} />
        </VStack>
      )}
      {hasFacts && (
        <MetadataList columns="multi">
          {cpv.length > 0 && <MetadataListItem label="Vad som upphandlas">{cpv.join(" · ")}</MetadataListItem>}
          {notice.published_at && (
            <MetadataListItem label="Publicerad">{formatShortDate(notice.published_at, "always")}</MetadataListItem>
          )}
          {notice.place && <MetadataListItem label="Plats">{notice.place}</MetadataListItem>}
        </MetadataList>
      )}
      {(page || documentsPage) && (
        <HStack gap={4} vAlign="center" wrap="wrap">
          {page && (
            <Link href={page.href} isExternalLink isStandalone>
              {noticeLinkText(page.site)}
            </Link>
          )}
          {documentsPage && documentsPage.href !== page?.href && (
            <Link href={documentsPage.href} isExternalLink isStandalone>
              {outsideDocumentsText(documentsPage.site)}
            </Link>
          )}
        </HStack>
      )}
      {showsDocuments && <DocumentList notice={notice} />}
      <UnreadFiles notice={notice} />
      {user?.role === "inkopare" && (
        <VStack gap={2}>
          <Text weight="semibold">Ladda upp underlag</Text>
          <DocumentUpload noticeId={notice.id} />
        </VStack>
      )}
    </VStack>
  );
}
