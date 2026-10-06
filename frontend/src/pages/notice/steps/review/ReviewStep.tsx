import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { ChecklistView, NoticeDetail, ReviewView, UserView } from "../../../../api/types";
import { ErrorNotice } from "../../../../components/states";
import { ArrowRightIcon, UploadIcon } from "../../../../components/ui/icons";
import { NextStepCard } from "../../../../components/ui/NextStepCard";
import { useStepNav } from "../../../../components/ui/StepNav";
import { StepLayout } from "../StepLayout";
import { ReviewRail } from "./ReviewRail";
import { ReviewResult } from "./ReviewResult";
import { reviewGroups, reviewVerdict } from "./reviewModel";
import { ReviewedFile, ReviewUpload } from "./ReviewUpload";

/** The latest reviewed draft: kept above the steps, so step 4 can tick what it found. The file itself is gone. */
export interface ReviewedDraft {
  view: ReviewView;
  fileName: string;
  /** Counts the reviews of this visit, to start each result fresh. */
  number: number;
}

export interface ReviewControls {
  reviewed: ReviewedDraft | null;
  review: (file: File) => void;
  isReviewing: boolean;
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
 * "Nästa steg": without a review, on to step 4; with things to fix, a new version first (one primary button per view,
 * so not while the upload form, with its own, is open).
 */
function StepEnd({
  mustFix,
  isUploadOpen,
  onNewVersion,
}: {
  /** How many things the latest review says must be fixed, or null before a review. */
  mustFix: number | null;
  isUploadOpen: boolean;
  onNewVersion: () => void;
}) {
  const { goTo } = useStepNav();
  const toSubmit = (variant: "primary" | "secondary") => (
    <Button
      label="Nästa: 4 Lämna in"
      variant={variant}
      endContent={<Icon icon={ArrowRightIcon} />}
      onClick={() => goTo("inlamning")}
    />
  );
  if (mustFix === null || isUploadOpen) {
    return (
      <NextStepCard
        text={
          mustFix === null
            ? "Har du inget utkast än? Du kan gå vidare och bocka av kraven inför inlämningen."
            : "Gå igenom listan inför inlämningen. Det som såg bra ut i utkastet är redan förbockat."
        }
        action={toSubmit("secondary")}
      />
    );
  }
  if (mustFix === 0) {
    return <NextStepCard text="Gå igenom listan inför inlämningen. Det som såg bra ut i utkastet är redan förbockat." action={toSubmit("primary")} />;
  }
  return (
    <NextStepCard
      text="Åtgärda det som saknas och granska sedan den nya versionen, så ser du att allt kom med."
      action={
        <>
          <Button label="Granska en ny version" variant="primary" icon={<Icon icon={UploadIcon} />} onClick={onNewVersion} />
          {toSubmit("secondary")}
        </>
      }
    />
  );
}

/**
 * Step 3 Granska (direction.md, section 4): the draft is checked against the published checklist and never stored.
 * Before a review the upload area, with the privacy rules beside it; after one the form folds into a row with
 * "Granska en ny version", and the result follows. Only a company can review, and only a published checklist.
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
  const { reviewed, isReviewing, error } = controls;

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

  const review = (file: File) => {
    controls.review(file);
    setIsUploadOpen(false);
  };
  const showsUpload = !reviewed || isUploadOpen || isReviewing;

  return (
    <StepLayout rail={<ReviewRail showsNotKept={!showsUpload} />} railLabel="Om granskningen">
      <Heading level={2}>Granska ditt anbudsutkast</Heading>
      {reviewed && !isUploadOpen && !isReviewing && (
        <ReviewedFile fileName={reviewed.fileName} onNewVersion={() => setIsUploadOpen(true)} />
      )}
      {showsUpload && <ReviewUpload onReview={review} isReviewing={isReviewing} takesFocus={isUploadOpen} />}
      {error !== null && error !== undefined && <ErrorNotice title="Utkastet kunde inte granskas" error={error} />}
      {reviewed && (
        <ReviewResult
          key={reviewed.number}
          view={reviewed.view}
          checklist={view.checklist}
          noticeId={notice.id}
          documentId={view.document_id}
        />
      )}
      <StepEnd
        mustFix={reviewed ? reviewVerdict(reviewGroups(reviewed.view, view.checklist)).mustFix : null}
        isUploadOpen={showsUpload}
        onNewVersion={() => setIsUploadOpen(true)}
      />
    </StepLayout>
  );
}
