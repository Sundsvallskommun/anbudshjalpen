import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useReviewRequired } from "../../api/queries";
import type { ChecklistProgress, NoticeDetail, UserView } from "../../api/types";
import { useAskAi } from "../../components/ask/AskAiProvider";
import { DocumentUpload } from "../../components/DocumentUpload";
import { calendarDateOf, formatClock, formatClockWithSeconds, formatShortDate, isPassed, swedishToday } from "../../lib/format";
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

/**
 * A checklist the worker is about to make while inköp does not review (decision 0019): it is published the moment it
 * is done, so the card shows it as coming, not as missing. The notice query asks again until it is there.
 */
function isComing(notice: NoticeDetail, reviewRequired: boolean): boolean {
  return !reviewRequired && !isOver(notice) && notice.has_documents && notice.checklist_progress !== null;
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
      if (!notice.has_documents) return "Ladda upp förfrågningsunderlaget, så tas en checklista fram och publiceras direkt.";
      return notice.checklist_progress
        ? "Underlaget tolkas automatiskt till en checklista som publiceras direkt. Den visas här så fort den är klar, oftast inom några minuter."
        : "Underlaget är inläst, men ingen checklista är på väg: tolkningen misslyckades, eller så är dokumenten bilagor. Under Inköp kan du be om en ny tolkning.";
    }
    return notice.has_documents
      ? "Underlaget tolkas till en checklista som du granskar i Inköp innan företagen ser den."
      : "Ladda upp förfrågningsunderlaget, så tas en checklista fram som du granskar innan den publiceras.";
  }
  if (notice.has_documents) {
    if (reviewRequired) {
      return "Underlaget finns, men inköp har inte granskat och publicerat någon checklista för den här upphandlingen ännu. Du kan ändå ställa frågor om underlaget.";
    }
    return notice.checklist_progress
      ? "Underlaget tolkas automatiskt, och kraven visas här så fort checklistan är klar, oftast inom några minuter. Du kan redan nu ställa frågor om underlaget."
      : "Underlaget finns, men det finns ingen checklista för den här upphandlingen ännu. Du kan ändå ställa frågor om underlaget.";
  }
  if (outsideDocuments) {
    const where = outsideDocuments.site === "eavrop" ? "i e-Avrop" : "hos upphandlingen";
    return `Underlaget finns ${where} men har inte lästs in här, så det finns ingen checklista att visa. Läs underlaget där.`;
  }
  return "Det finns inget underlag att läsa här ännu. Läs annonsen för att se vad som efterfrågas.";
}

/** A time today as "kl. 15:42", with its date when it falls on another day. */
function whenText(value: string, now: Date): string {
  const clock = formatClock(value) ?? "";
  if (calendarDateOf(value) === swedishToday(now)) return clock || "strax";
  return `${formatShortDate(value, "auto", now)} ${clock}`.trim();
}

/**
 * Where the interpretation is, in the reader's words (decision 0019): in the worker's queue with the next run's time,
 * running right now, or failed and tried again from a time. The worker's own words ("pending", "retrying") stay inside.
 */
export function progressText(progress: ChecklistProgress, now: Date = new Date()): string {
  if (progress.state === "running") return "Tolkning pågår. Tar oftast under en minut.";
  if (progress.state === "retrying") {
    const failed = `Försök ${progress.attempts} av ${progress.max_attempts} misslyckades.`;
    if (progress.retry_at && !isPassed(progress.retry_at, now)) return `${failed} Försöker igen tidigast ${whenText(progress.retry_at, now)}.`;
    return `${failed} Försöker igen vid nästa körning.`;
  }
  if (!progress.next_run_at) return "Står i kö för tolkning.";
  if (isPassed(progress.next_run_at, now)) return "Står i kö. Nästa tolkning väntas när som helst.";
  return `Står i kö. Nästa tolkning väntas ${whenText(progress.next_run_at, now)}.`;
}

/** The status row of a checklist on its way: where the interpretation is, and when the page last asked. */
function Progress({ progress, checkedAt }: { progress: ChecklistProgress; checkedAt: number }) {
  return (
    <VStack gap={1} hAlign="center">
      <HStack gap={2} vAlign="center" role="status">
        <HStack aria-hidden="true">
          <Spinner size="sm" />
        </HStack>
        <Text type="supporting">{progressText(progress)}</Text>
      </HStack>
      {/* Not in the live region: it changes on every check, and would be read out each time. */}
      <Text type="supporting" color="secondary">
        {`Sidan uppdateras automatiskt. Senast kontrollerad ${formatClockWithSeconds(checkedAt)}.`}
      </Text>
    </VStack>
  );
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
 * is not promised a checklist. While inköp does not review and the worker is about to make the checklist, the card
 * says it is on its way, where the interpretation is and when the page last asked (`checkedAt`, the notice query's
 * `dataUpdatedAt`), and the steps take its place when it comes (decision 0019).
 */
export function NoChecklist({ notice, user, checkedAt }: { notice: NoticeDetail; user: UserView | null; checkedAt: number }) {
  const askAi = useAskAi();
  const reviewRequired = useReviewRequired();
  const progress = isComing(notice, reviewRequired) ? notice.checklist_progress : null;
  const title = progress ? "Checklistan tas fram" : `Ingen ${checklistWords(reviewRequired)}${isOver(notice) ? "" : " ännu"}`;
  const page = externalLink(notice.url);
  const documentsPage = notice.has_documents ? null : externalLink(notice.documents_url);
  const outsideDocuments = documentsPage && documentsPage.href !== page?.href ? documentsPage : null;

  return (
    <VStack gap={6}>
      <Card>
        <VStack gap={4}>
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
          {progress && <Progress progress={progress} checkedAt={checkedAt} />}
        </VStack>
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
