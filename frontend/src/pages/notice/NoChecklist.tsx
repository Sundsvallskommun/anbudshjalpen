import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/VStack";
import { useReviewRequired } from "../../api/queries";
import type { NoticeDetail, UserView } from "../../api/types";
import { useAskAi } from "../../components/ask/AskAiProvider";
import { DocumentUpload } from "../../components/DocumentUpload";
import { noticeDeadlineLabel } from "../../lib/labels";
import { externalLink, noticeLinkText, type ExternalLink } from "../../lib/links";
import { outsideDocumentsText } from "./header/Documents";
import { PublishedAnswers } from "./steps/question/PublishedAnswers";

/** A notice past sista anbudsdag, or awarded: no checklist is on its way, so the card does not say "ännu". */
function isOver(notice: NoticeDetail): boolean {
  return notice.status === "closed" || notice.status === "awarded";
}

/** "Granskad checklista" while inköp reviews; without the review the word says nothing (decision 0017). */
function checklistWords(reviewRequired: boolean): string {
  return reviewRequired ? "granskad checklista" : "checklista";
}

function reason(
  notice: NoticeDetail,
  user: UserView | null,
  outsideDocuments: ExternalLink | null,
  reviewRequired: boolean,
): string {
  if (isOver(notice)) {
    const why = notice.status === "awarded" ? "Tilldelningsbeslutet är fattat" : `${noticeDeadlineLabel(notice)} har passerat`;
    return `${why}, och det finns ingen ${checklistWords(reviewRequired)} för upphandlingen.${externalLink(notice.url) ? " Läs mer i annonsen." : ""}`;
  }
  if (user?.role === "inkopare") {
    if (!reviewRequired) {
      return notice.has_documents
        ? "Underlaget tolkas till en checklista som publiceras direkt, märkt att inköp inte har granskat den."
        : "Ladda upp förfrågningsunderlaget, så tas en checklista fram och publiceras direkt.";
    }
    return notice.has_documents
      ? "Underlaget tolkas till en checklista som du granskar i Inköp innan företagen ser den."
      : "Ladda upp förfrågningsunderlaget, så tas en checklista fram som du granskar innan den publiceras.";
  }
  if (notice.has_documents) {
    return reviewRequired
      ? "Underlaget finns, men inköp har inte granskat och publicerat någon checklista för den här upphandlingen ännu. Du kan ändå ställa frågor om underlaget."
      : "Underlaget finns, men det finns ingen checklista för den här upphandlingen ännu. Du kan ändå ställa frågor om underlaget.";
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
 * the notice's own page, the documents where they are kept and, when there is a document here, "Fråga underlaget",
 * which opens the "Fråga AI" panel (decision 0014). Inköp's published answers follow (decision 0013). The reminder
 * before sista anbudsdag is the one beside the date in the key facts: one per deadline. A closed or awarded notice
 * is not promised a checklist.
 */
export function NoChecklist({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  const askAi = useAskAi();
  const reviewRequired = useReviewRequired();
  const title = `Ingen ${checklistWords(reviewRequired)}${isOver(notice) ? "" : " ännu"}`;
  const page = externalLink(notice.url);
  const documentsPage = notice.has_documents ? null : externalLink(notice.documents_url);
  const outsideDocuments = documentsPage && documentsPage.href !== page?.href ? documentsPage : null;

  return (
    <VStack gap={6}>
      <Card>
        <EmptyState
          headingLevel={2}
          title={title}
          description={reason(notice, user, documentsPage, reviewRequired)}
          actions={
            <HStack gap={3} vAlign="center" hAlign="center" wrap="wrap">
              {page && <OutsideButton href={page.href} text={noticeLinkText(page.site)} />}
              {outsideDocuments && <OutsideButton href={outsideDocuments.href} text={outsideDocumentsText(outsideDocuments.site)} />}
              {notice.has_documents && <Button label="Fråga underlaget" variant="primary" onClick={() => askAi.open()} />}
            </HStack>
          }
        />
      </Card>
      {user?.role === "inkopare" && !notice.has_documents && (
        <Card>
          <DocumentUpload noticeId={notice.id} />
        </Card>
      )}
      <PublishedAnswers notice={notice} />
    </VStack>
  );
}
