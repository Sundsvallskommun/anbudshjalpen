import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible, CollapsibleGroup, useCollapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, type ReactNode } from "react";
import type { NoticeDetail, UserView } from "../../../api/types";
import { externalLink } from "../../../lib/links";
import { useIsPhone } from "../../../lib/usePhone";
import { useReadingTrace } from "../../../shell/readingTrace";
import { primaryDocumentId, publishedChecklist, requirementTitles } from "../noticeData";
import { READING_TITLE, ReadingTrace } from "../reading/ReadingTrace";
import { AboutNotice } from "./AboutNotice";
import { DocumentLinks } from "./Documents";
import { FIT_HEADING, FitReasons } from "./FitReasons";
import styles from "./HeaderDisclosures.module.css";

const ABOUT = "Om upphandlingen";

function reasonCount(count: number): string {
  return `(${count} skäl)`;
}

/** A disclosure button with its chevron; the panel it controls sits below the whole row. */
function DisclosureButton({
  title,
  detail,
  isOpen,
  controls,
  onToggle,
}: {
  title: string;
  detail?: string;
  isOpen: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <Button
      label={detail ? `${title} ${detail}` : title}
      variant="ghost"
      icon={<Icon icon={isOpen ? "chevronDown" : "chevronRight"} />}
      aria-expanded={isOpen}
      aria-controls={controls}
      onClick={onToggle}
    >
      {title}
      {detail && (
        <>
          {" "}
          <Text color="secondary">{detail}</Text>
        </>
      )}
    </Button>
  );
}

function Panel({ id, isOpen, children }: { id: string; isOpen: boolean; children: ReactNode }) {
  return (
    <VStack id={id} hidden={!isOpen} className={styles.panel}>
      <Card>{children}</Card>
    </VStack>
  );
}

interface DisclosureProps {
  notice: NoticeDetail;
  user: UserView | null;
}

/**
 * Wide screens: the disclosures side by side and the document link at the end of the row; panels below. The demo's
 * "Så lästes underlaget" joins the row while its switch in "Om demon och AI" is on.
 */
function DisclosureRow({ notice, user }: DisclosureProps) {
  const fit = useCollapsible({ isCollapsible: { defaultIsOpen: false } });
  const about = useCollapsible({ isCollapsible: { defaultIsOpen: false } });
  const reading = useCollapsible({ isCollapsible: { defaultIsOpen: false } });
  const [showsReading] = useReadingTrace();
  const fitId = useId();
  const aboutId = useId();
  const readingId = useId();
  const match = notice.match;
  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={2} vAlign="center" wrap="wrap">
          {match && (
            <DisclosureButton
              title={FIT_HEADING[match.fit]}
              detail={reasonCount(match.assessment.reasons.length)}
              isOpen={fit.isOpen}
              controls={fitId}
              onToggle={fit.toggle}
            />
          )}
          <DisclosureButton title={ABOUT} isOpen={about.isOpen} controls={aboutId} onToggle={about.toggle} />
          {showsReading && (
            <DisclosureButton title={READING_TITLE} isOpen={reading.isOpen} controls={readingId} onToggle={reading.toggle} />
          )}
        </HStack>
        <DocumentLinks notice={notice} />
      </HStack>
      {match && (
        <Panel id={fitId} isOpen={fit.isOpen}>
          <FitReasons
            match={match}
            noticeId={notice.id}
            documentId={primaryDocumentId(notice)}
            hasChecklist={publishedChecklist(notice) !== null}
            requirementTitles={requirementTitles(notice)}
          />
        </Panel>
      )}
      <Panel id={aboutId} isOpen={about.isOpen}>
        <AboutNotice notice={notice} user={user} showsDocuments={notice.documents.length > 1} />
      </Panel>
      {showsReading && (
        <Panel id={readingId} isOpen={reading.isOpen}>
          <ReadingTrace notice={notice} />
        </Panel>
      )}
    </VStack>
  );
}

/**
 * A phone: the disclosures as rows of one card, full-width 44 px targets; the documents, or the link to them where
 * they are kept, move into "Om upphandlingen och underlaget". The card's own padding gives way to the rows', so the
 * steps start on the first screen.
 */
function DisclosureCard({ notice, user }: DisclosureProps) {
  const match = notice.match;
  const [showsReading] = useReadingTrace();
  const hasDocuments = notice.documents.length > 0 || externalLink(notice.documents_url) !== null;
  const aboutTitle = hasDocuments ? `${ABOUT} och underlaget` : ABOUT;
  return (
    <Card padding={0}>
      <VStack paddingInline={4}>
        <CollapsibleGroup type="multiple" defaultValue={[]} hasDividers density="compact">
          {match && (
            <Collapsible
              value="passform"
              trigger={
                <Text weight="medium">
                  {`${FIT_HEADING[match.fit]} `}
                  <Text color="secondary">{reasonCount(match.assessment.reasons.length)}</Text>
                </Text>
              }
            >
              <FitReasons
                match={match}
                noticeId={notice.id}
                documentId={primaryDocumentId(notice)}
                hasChecklist={publishedChecklist(notice) !== null}
                requirementTitles={requirementTitles(notice)}
              />
            </Collapsible>
          )}
          <Collapsible value="om" trigger={<Text weight="medium">{aboutTitle}</Text>}>
            <AboutNotice notice={notice} user={user} showsDocuments />
          </Collapsible>
          {showsReading && (
            <Collapsible value="lasning" trigger={<Text weight="medium">{READING_TITLE}</Text>}>
              <ReadingTrace notice={notice} />
            </Collapsible>
          )}
        </CollapsibleGroup>
      </VStack>
    </Card>
  );
}

/**
 * Below the key facts (direction.md, section 4): "Därför verkar den passa (4 skäl)" and "Om upphandlingen", closed,
 * and "Underlaget · 17 sidor", which opens the source dialog on page 1.
 */
export function HeaderDisclosures(props: DisclosureProps) {
  const isPhone = useIsPhone();
  return isPhone ? <DisclosureCard {...props} /> : <DisclosureRow {...props} />;
}
