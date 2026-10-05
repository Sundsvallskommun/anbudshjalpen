import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeDetail } from "../../api/types";
import { CitationChip } from "../../components/citations/CitationChip";
import { noticeOrigin } from "../../components/NoticeRow";
import { ReminderAction } from "../../components/ReminderAction";
import { Row, RowList } from "../../components/RowList";
import { FictitiousToken, FitToken, NoticeStatusToken } from "../../components/tokens";
import { formatCalendarDate, formatDate, formatDateTime, formatSek, relativeDeadline } from "../../lib/format";
import { REASON_KIND } from "../../lib/labels";
import { externalLink, noticeLinkText } from "../../lib/links";
import { checklistDate, primaryDocumentId, reminderDeadline } from "./noticeData";

/** Status, buyer and the dates and facts a supplier decides on, with the way to the original notice. */
export function NoticeFacts({ notice }: { notice: NoticeDetail }) {
  const questionDeadline = checklistDate(notice, "fragestopp");
  const tenderReminder = notice.status === "open" ? reminderDeadline(notice, "sista_anbudsdag") : null;
  const noticeLink = externalLink(notice.url);
  const documentsLink = externalLink(notice.documents_url);
  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Text color="secondary">{noticeOrigin(notice)}</Text>
        <HStack gap={2} wrap="wrap">
          {notice.fit && <FitToken fit={notice.fit} />}
          <NoticeStatusToken status={notice.status} />
          {notice.is_fictitious && <FictitiousToken />}
        </HStack>
      </VStack>
      <MetadataList columns="multi">
        {notice.deadline_at && (
          <MetadataListItem label="Sista anbudsdag">
            {`${formatDateTime(notice.deadline_at)} (${relativeDeadline(notice.deadline_at)})`}
          </MetadataListItem>
        )}
        {questionDeadline && (
          <MetadataListItem label="Sista dag för frågor">{formatCalendarDate(questionDeadline)}</MetadataListItem>
        )}
        {notice.published_at && (
          <MetadataListItem label="Publicerad">{formatDate(notice.published_at)}</MetadataListItem>
        )}
        {notice.procedure && <MetadataListItem label="Förfarande">{notice.procedure}</MetadataListItem>}
        {notice.place && <MetadataListItem label="Plats">{notice.place}</MetadataListItem>}
        {notice.estimated_value_sek !== null && (
          <MetadataListItem label="Uppskattat värde">{formatSek(notice.estimated_value_sek)}</MetadataListItem>
        )}
        {notice.cpv_codes.length > 0 && (
          <MetadataListItem label="CPV-koder">{notice.cpv_codes.join(", ")}</MetadataListItem>
        )}
      </MetadataList>
      {notice.description && <Text as="p">{notice.description}</Text>}
      <HStack gap={4} vAlign="center" wrap="wrap">
        {noticeLink && (
          <Link href={noticeLink.href} isExternalLink isStandalone>
            {noticeLinkText(noticeLink.site)}
          </Link>
        )}
        {documentsLink && documentsLink.href !== noticeLink?.href && (
          <Link href={documentsLink.href} isExternalLink isStandalone>
            {documentsLink.site === "eavrop" ? "Underlaget i e-Avrop" : "Öppna underlaget"}
          </Link>
        )}
        {tenderReminder && (
          <ReminderAction
            noticeId={notice.id}
            kind="sista_anbudsdag"
            deadline={tenderReminder}
            subject="sista anbudsdag"
          />
        )}
      </HStack>
    </VStack>
  );
}

/** Journey step 8: what the award decision means and what the standstill period is. Sourced from LOU. */
export function AwardExplanation() {
  return (
    <Banner status="info" title="Tilldelningsbeslut är fattat" collapsible={false}>
      <VStack gap={2}>
        <Text as="p">
          Kommunen har beslutat vem som får kontraktet. Alla som har lämnat anbud ska få en skriftlig
          underrättelse om beslutet och skälen för det (LOU 12 kap. 12 §).
        </Text>
        <Text as="p">
          Efter beslutet gäller avtalsspärr: kommunen får inte teckna avtal förrän 10 dagar har gått om
          underrättelsen skickades elektroniskt, annars 15 dagar (LOU 20 kap. 1 §). Under den tiden kan en
          leverantör som anser att reglerna inte har följts ansöka om överprövning hos förvaltningsrätten (LOU 20
          kap. 4 §).
        </Text>
        <Link href="/regelhjalpen" isStandalone>
          Fråga Regelhjälpen om tilldelning och avtalsspärr
        </Link>
      </VStack>
    </Banner>
  );
}

/** The company's fit assessment for this notice, with reasons and their sources. */
export function MatchSummary({ notice }: { notice: NoticeDetail }) {
  const match = notice.match;
  if (!match) return null;
  return (
    <VStack gap={3} as="section" aria-labelledby="match-heading">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={2} id="match-heading">
          Passar upphandlingen er?
        </Heading>
        <FitToken fit={match.fit} />
      </HStack>
      <Text as="p">{match.assessment.summary}</Text>
      <RowList label="Skäl">
        {match.assessment.reasons.map((reason, index) => (
          <Row key={index}>
            <VStack gap={2} hAlign="start">
              <Text>
                <Text weight="semibold">{REASON_KIND[reason.kind]}:</Text> {reason.text}
              </Text>
              {reason.citation && (
                <CitationChip citation={reason.citation} documentId={primaryDocumentId(notice)} />
              )}
            </VStack>
          </Row>
        ))}
      </RowList>
      <Text type="supporting">Bedömningen är ett stöd. Läs alltid kraven i underlaget innan ni bestämmer er.</Text>
    </VStack>
  );
}
