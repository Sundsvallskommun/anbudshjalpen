import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeDetail, UserView } from "../../../api/types";
import { FictitiousToken, FitToken, NoticeStatusToken, PublishedChecklistToken } from "../../../components/tokens";
import { noticeMeta, publishedChecklist } from "../noticeData";
import { HeaderDisclosures } from "./HeaderDisclosures";
import { KeyFacts } from "./KeyFacts";

/**
 * The line under the h1: who buys and the reference number, then only the tokens that say something (direction.md,
 * section 4), in its order: a status other than open, "Fiktiv", the fit and "Granskad checklista".
 */
export function NoticeIntro({ notice }: { notice: NoticeDetail }) {
  const meta = noticeMeta(notice);
  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      {meta && <Text color="secondary">{meta}</Text>}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <NoticeStatusToken status={notice.status} size="sm" />
        {notice.is_fictitious && <FictitiousToken size="sm" />}
        {notice.fit && <FitToken fit={notice.fit} size="sm" />}
        {publishedChecklist(notice) && <PublishedChecklistToken size="sm" />}
      </HStack>
    </HStack>
  );
}

/** What the award decision means and what the standstill period is (journey step 8). Sourced from LOU. */
export function AwardExplanation() {
  return (
    <Banner status="info" title="Tilldelningsbeslut är fattat" collapsible={false}>
      <VStack gap={2}>
        <Text as="p">
          Kommunen har beslutat vem som får kontraktet. Alla som har lämnat anbud ska få en skriftlig underrättelse om
          beslutet och skälen för det (LOU 12 kap. 12 §).
        </Text>
        <Text as="p">
          Efter beslutet gäller avtalsspärr: kommunen får inte teckna avtal förrän 10 dagar har gått om underrättelsen
          skickades elektroniskt, annars 15 dagar (LOU 20 kap. 1 §). Under den tiden kan en leverantör som anser att
          reglerna inte har följts ansöka om överprövning hos förvaltningsrätten (LOU 20 kap. 4 §).
        </Text>
        <Link href="/regelhjalpen" isStandalone>
          Fråga Regelhjälpen om tilldelning och avtalsspärr
        </Link>
      </VStack>
    </Banner>
  );
}

/**
 * The header every step shares, below the h1 (direction.md, section 4): the four key facts, the closed disclosures
 * with the document link, and for an awarded notice what the decision means. The steps start right after it.
 */
export function NoticeHeader({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  return (
    <>
      <KeyFacts notice={notice} />
      <HeaderDisclosures notice={notice} user={user} />
      {notice.status === "awarded" && <AwardExplanation />}
    </>
  );
}
