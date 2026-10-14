import { useRef, useState } from "react";
import { useReviewDraft } from "../../../api/queries";
import type { ChecklistView, NoticeDetail, UserView } from "../../../api/types";
import { DeadlineBlock } from "../../../components/ui/DeadlineBlock";
import { noticeDeadlineLabel } from "../../../lib/labels";
import { StepNav, type StepMark, type StepValue } from "../../../components/ui/StepNav";
import { RequirementsStep } from "./requirements/RequirementsStep";
import { reviewGroups, reviewVerdict } from "./review/reviewModel";
import { ReviewStep, type ReviewControls, type ReviewedDraft } from "./review/ReviewStep";

/**
 * The latest review of this visit, above the steps: step 2 shows it and the step bar marks it. The draft's files
 * are never kept; only the result and their names are, until the page is left.
 */
function useReview(notice: NoticeDetail): ReviewControls {
  const mutation = useReviewDraft(notice.id);
  const [reviewed, setReviewed] = useState<ReviewedDraft | null>(null);
  const [reviewingFileNames, setReviewingFileNames] = useState<string[] | null>(null);
  const count = useRef(0);
  // The last draft, so a failed review can be run again without choosing the files anew. Gone with the page.
  const lastFiles = useRef<File[] | null>(null);
  const review = (files: File[]) => {
    const fileNames = files.map((file) => file.name);
    lastFiles.current = files;
    setReviewingFileNames(fileNames);
    mutation.mutate(files, {
      onSuccess: (view) => {
        count.current += 1;
        setReviewed({ view, fileNames, number: count.current });
      },
      onSettled: () => setReviewingFileNames(null),
    });
  };
  return {
    reviewed,
    review,
    retry: () => {
      if (lastFiles.current) review(lastFiles.current);
    },
    isReviewing: mutation.isPending,
    reviewingFileNames,
    error: mutation.isError ? mutation.error : null,
  };
}

function reviewMark(reviewed: ReviewedDraft | null, view: ChecklistView): StepMark | undefined {
  if (!reviewed) return undefined;
  const verdict = reviewVerdict(reviewGroups(reviewed.view, view.checklist));
  if (verdict.mustFix > 0) return "warning";
  return verdict.essential > 0 && verdict.good === verdict.essential ? "success" : undefined;
}

/**
 * The two steps of a notice with a checklist (direction.md, section 4, with step 2 Fråga replaced by the "Fråga AI"
 * panel in decision 0014 and step 4 Lämna in folded into Granska in decision 0024): 1 Krav and 2 Granska in a sticky
 * bar, with sista anbudsdag at its end once it has stuck. Granska is marked when a review found gaps, or when
 * everything looked fine.
 */
export function NoticeSteps({ notice, view, user }: { notice: NoticeDetail; view: ChecklistView; user: UserView | null }) {
  const review = useReview(notice);
  const mark = reviewMark(review.reviewed, view);
  const marks: Partial<Record<StepValue, StepMark>> = mark ? { granska: mark } : {};
  return (
    <StepNav
      marks={marks}
      end={
        notice.deadline_at ? (
          <DeadlineBlock deadline={notice.deadline_at} label={noticeDeadlineLabel(notice)} variant="inline" />
        ) : undefined
      }
      panels={{
        checklista: () => <RequirementsStep notice={notice} view={view} user={user} />,
        granska: () => <ReviewStep notice={notice} view={view} user={user} controls={review} />,
      }}
    />
  );
}
