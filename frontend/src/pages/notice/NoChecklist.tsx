import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import type { NoticeDetail, UserView } from "../../api/types";
import { DocumentUpload } from "../../components/DocumentUpload";
import { STEP_PARAM } from "../../components/ui/StepNav";
import { noticeDeadlineLabel } from "../../lib/labels";
import { externalLink, noticeLinkText, type ExternalLink } from "../../lib/links";
import { outsideDocumentsText } from "./header/Documents";
import { QUESTION_HEADING_ID, QuestionStep } from "./steps/question/QuestionStep";

const ASKING = "fraga";

/** A notice past sista anbudsdag, or awarded: no checklist is on its way, so the card does not say "ännu". */
function isOver(notice: NoticeDetail): boolean {
  return notice.status === "closed" || notice.status === "awarded";
}

function reason(notice: NoticeDetail, user: UserView | null, outsideDocuments: ExternalLink | null): string {
  if (isOver(notice)) {
    const why = notice.status === "awarded" ? "Tilldelningsbeslutet är fattat" : `${noticeDeadlineLabel(notice)} har passerat`;
    return `${why}, och det finns ingen granskad checklista för upphandlingen.${externalLink(notice.url) ? " Läs mer i annonsen." : ""}`;
  }
  if (user?.role === "inkopare") {
    return notice.has_documents
      ? "Underlaget tolkas till en checklista som du granskar i Inköp innan företagen ser den."
      : "Ladda upp förfrågningsunderlaget, så tas en checklista fram som du granskar innan den publiceras.";
  }
  if (notice.has_documents) {
    return "Underlaget finns, men inköp har inte granskat och publicerat någon checklista för den här upphandlingen ännu. Du kan ändå ställa frågor om underlaget.";
  }
  if (outsideDocuments) {
    const where = outsideDocuments.site === "eavrop" ? "i e-Avrop" : "hos upphandlingen";
    return `Underlaget finns ${where} men har inte lästs in här, så det finns ingen checklista att visa. Läs underlaget där.`;
  }
  return "Det finns inget underlag att läsa här ännu. Läs annonsen för att se vad som efterfrågas.";
}

/** A link out of the app as a button that says it opens a new tab. */
function OutsideButton({ href, text }: { href: string; text: string }) {
  return (
    <Button
      label={`${text} (öppnas i en ny flik)`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      endContent={<Icon icon="externalLink" />}
    >
      {text}
    </Button>
  );
}

/**
 * A notice without a checklist (most TED notices; direction.md, section 4): no steps, but why there is no checklist,
 * the notice's own page, the documents where they are kept and, when there is a document here, questions about it.
 * The questions open below (`?flik=fraga`, so the place can be linked to). The reminder before sista anbudsdag is
 * the one beside the date in the key facts: one per deadline. A closed or awarded notice is not promised a checklist.
 */
export function NoChecklist({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  const [params, setParams] = useSearchParams();
  const isAsking = notice.has_documents && params.get(STEP_PARAM) === ASKING;
  const wantsFocus = useRef(false);
  const page = externalLink(notice.url);
  const documentsPage = notice.has_documents ? null : externalLink(notice.documents_url);
  const outsideDocuments = documentsPage && documentsPage.href !== page?.href ? documentsPage : null;

  useEffect(() => {
    if (!isAsking || !wantsFocus.current) return;
    wantsFocus.current = false;
    document.getElementById(QUESTION_HEADING_ID)?.focus();
  }, [isAsking]);

  const ask = () => {
    wantsFocus.current = true;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(STEP_PARAM, ASKING);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <VStack gap={6}>
      <Card>
        <EmptyState
          headingLevel={2}
          title={isOver(notice) ? "Ingen granskad checklista" : "Ingen granskad checklista ännu"}
          description={reason(notice, user, documentsPage)}
          actions={
            <HStack gap={3} vAlign="center" hAlign="center" wrap="wrap">
              {page && <OutsideButton href={page.href} text={noticeLinkText(page.site)} />}
              {outsideDocuments && <OutsideButton href={outsideDocuments.href} text={outsideDocumentsText(outsideDocuments.site)} />}
              {notice.has_documents && !isAsking && <Button label="Fråga underlaget" variant="primary" onClick={ask} />}
            </HStack>
          }
        />
      </Card>
      {user?.role === "inkopare" && !notice.has_documents && (
        <Card>
          <DocumentUpload noticeId={notice.id} />
        </Card>
      )}
      {isAsking && <QuestionStep notice={notice} />}
    </VStack>
  );
}
