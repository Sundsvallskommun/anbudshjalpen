import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeDetail, UserView } from "../../api/types";
import {
  AttachmentsSection,
  DatesSection,
  EvaluationSection,
  OpenQuestionsSection,
  RequirementsSection,
  SummarySection,
  TermsSection,
} from "../../components/checklist/ChecklistSections";
import { CHECKLIST_STATUS } from "../../lib/labels";

function NoChecklist({ notice }: { notice: NoticeDetail }) {
  const waitingForReview = notice.checklist_status === "draft" || notice.checklist_status === "approved";
  const description = !notice.has_documents
    ? "Det finns inget underlag att tolka ännu. Underlaget hämtas från e-Avrop eller laddas upp av inköp."
    : waitingForReview
      ? "Inköp granskar checklistan innan den publiceras, så att du kan lita på den."
      : "Underlaget har inte gjorts om till en checklista ännu.";
  return <EmptyState headingLevel={2} title="Ingen checklista ännu" description={description} />;
}

/** Journey step 4: requirements, attachments, evaluation and dates, each linked to its page. */
export function ChecklistTab({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  const view = notice.checklist;
  if (!view) return <NoChecklist notice={notice} />;

  const { checklist, document_id: documentId } = view;
  return (
    <VStack gap={8}>
      {view.status !== "published" && (
        <Banner
          status="warning"
          title={`Inte publicerad: ${CHECKLIST_STATUS[view.status].toLocaleLowerCase("sv")}`}
          description="Företag ser checklistan först när inköp har granskat och publicerat den."
          collapsible={false}
          endContent={
            user?.role === "inkopare" ? (
              <Button label="Granska checklistan" size="sm" href={`/inkop/checklistor/${view.id}`} />
            ) : undefined
          }
        />
      )}
      <SummarySection checklist={checklist} verification={view.verification} />
      <DatesSection
        checklist={checklist}
        documentId={documentId}
        noticeId={notice.id}
        canRemind={notice.status === "open" && view.status === "published"}
      />
      <RequirementsSection checklist={checklist} documentId={documentId} />
      <AttachmentsSection checklist={checklist} documentId={documentId} />
      <EvaluationSection checklist={checklist} documentId={documentId} />
      <TermsSection checklist={checklist} documentId={documentId} />
      <OpenQuestionsSection checklist={checklist} />
    </VStack>
  );
}
