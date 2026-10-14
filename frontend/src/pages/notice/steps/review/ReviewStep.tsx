import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { ChecklistView, NoticeDetail, ReviewView, UserView } from "../../../../api/types";
import { ErrorNotice } from "../../../../components/states";
import { UploadIcon } from "../../../../components/ui/icons";
import { NextStepCard } from "../../../../components/ui/NextStepCard";
import { StepLayout } from "../StepLayout";
import { HandInCard } from "./HandInCard";
import { ReviewRail } from "./ReviewRail";
import { ReviewResult } from "./ReviewResult";
import { reviewGroups, reviewVerdict } from "./reviewModel";
import { ReviewedFile, ReviewInProgress, ReviewUpload } from "./ReviewUpload";

/** The latest reviewed draft: kept above the steps, so it survives a step change. The files themselves are gone. */
export interface ReviewedDraft {
  view: ReviewView;
  /** The draft's files by name, as chosen: the tender and what goes with it (decision 0025). */
  fileNames: string[];
  /** Counts the reviews of this visit, to start each result fresh. */
  number: number;
}

export interface ReviewControls {
  reviewed: ReviewedDraft | null;
  review: (files: File[]) => void;
  /** Review the last draft again, after a failure. */
  retry: () => void;
  isReviewing: boolean;
  /** The draft under review, its files by name, while `isReviewing`. */
  reviewingFileNames: string[] | null;
  error: unknown;
}

/** Why the step cannot be used yet, on a card like the other states of the page. */
function NotYet({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Card>
      <EmptyState headingLevel={2} title={title} description={description} actions={action} />
    </Card>
  );
}

/**
 * The end of the last step (decision 0024): with things to fix, "Nästa steg" asks for a new version first, and in
 * every state "Lämna anbudet" says where and by when the tender is handed in. Its link is the view's primary action
 * only after a review that found nothing to fix: the upload form and "Granska en ny version" have theirs (one primary
 * button per view).
 */
function StepEnd({
  notice,
  mustFix,
  isUploadOpen,
  onNewVersion,
}: {
  notice: NoticeDetail;
  /** How many things the latest review says should be fixed, or null before a review. */
  mustFix: number | null;
  isUploadOpen: boolean;
  onNewVersion: () => void;
}) {
  const hasGaps = mustFix !== null && mustFix > 0;
  return (
    <>
      {hasGaps && !isUploadOpen && (
        <NextStepCard
          text="Gå igenom det granskningen pekar på. Åtgärda det som faktiskt saknas och granska sedan den nya versionen, så ser du att allt kom med."
          action={<Button label="Granska en ny version" variant="primary" icon={<Icon icon={UploadIcon} />} onClick={onNewVersion} />}
        />
      )}
      <HandInCard notice={notice} variant={mustFix === 0 && !isUploadOpen ? "primary" : "secondary"} />
    </>
  );
}

/**
 * Step 2 Granska, the last step (direction.md, section 4, and decisions 0024 and 0025): the draft, the tender and
 * what goes with it, is checked against the published checklist and never stored.
 * Before a review the upload form, with the privacy rules beside it; the files are collected and "Granska utkastet"
 * starts the review, and a card shows the work while it runs. After it the form folds into a row with "Granska en
 * ny version", and the result follows and takes the focus, so the answer is where the reader lands. Only a company
 * can review, and only a published checklist.
 */
export function ReviewStep({
  notice,
  view,
  user,
  controls,
}: {
  notice: NoticeDetail;
  view: ChecklistView;
  user: UserView | null;
  controls: ReviewControls;
}) {
  const { pathname, search } = useLocation();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { reviewed, isReviewing, reviewingFileNames, error } = controls;
  const resultTitle = useRef<HTMLHeadingElement>(null);
  // A result that arrives while the step is open takes the focus; one already there when the step opens does not.
  const seen = useRef(reviewed?.number ?? 0);

  useEffect(() => {
    if (!reviewed || reviewed.number === seen.current) return;
    seen.current = reviewed.number;
    resultTitle.current?.focus();
  }, [reviewed]);

  if (view.status !== "published") {
    return (
      <NotYet
        title="Granskning går inte att göra ännu"
        description="Utkastet granskas mot den publicerade checklistan, och den finns inte för den här upphandlingen ännu."
      />
    );
  }
  if (user?.role !== "foretagare") {
    return (
      <NotYet
        title="Logga in som företagare för att granska ett utkast"
        description="Granskningen visar krav för krav vad som saknas eller behöver bevis i ditt anbudsutkast. Utkastet sparas inte."
        action={
          // Secondary: the frame's own "Logga in" is the view's primary button.
          user ? undefined : <Button label="Logga in" href={`/logga-in?till=${encodeURIComponent(pathname + search)}`} />
        }
      />
    );
  }

  const review = (files: File[]) => {
    controls.review(files);
    setIsUploadOpen(false);
  };
  const showsUpload = !isReviewing && (!reviewed || isUploadOpen);
  const showsReviewedRow = !isReviewing && reviewed !== null && !isUploadOpen;

  return (
    <StepLayout rail={<ReviewRail showsNotKept={!showsUpload} />} railLabel="Om granskningen">
      <Heading level={2}>Granska ditt anbudsutkast</Heading>
      {isReviewing && (
        <ReviewInProgress fileNames={reviewingFileNames ?? ["Ditt utkast"]} requirementCount={view.checklist.requirements.length} />
      )}
      {showsReviewedRow && reviewed && (
        <ReviewedFile fileNames={reviewed.fileNames} onNewVersion={() => setIsUploadOpen(true)} />
      )}
      {!isReviewing && error !== null && error !== undefined && (
        <ErrorNotice title="Utkastet kunde inte granskas" error={error} onRetry={controls.retry} />
      )}
      {showsUpload && <ReviewUpload onReview={review} takesFocus={isUploadOpen} />}
      {reviewed && (
        <ReviewResult
          key={reviewed.number}
          view={reviewed.view}
          checklist={view.checklist}
          noticeId={notice.id}
          documentId={view.document_id}
          titleRef={resultTitle}
        />
      )}
      {!isReviewing && (
        <StepEnd
          notice={notice}
          mustFix={reviewed ? reviewVerdict(reviewGroups(reviewed.view, view.checklist)).mustFix : null}
          isUploadOpen={showsUpload}
          onNewVersion={() => setIsUploadOpen(true)}
        />
      )}
    </StepLayout>
  );
}
