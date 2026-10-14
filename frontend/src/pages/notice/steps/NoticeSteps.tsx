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
 * The latest review of this visit, above the steps: step 2 shows it and the step bar marks it. The draft itself is
 * never kept; only the result is, until the page is left.
 */
function useReview(notice: NoticeDetail): ReviewControls {
  const mutation = useReviewDraft(notice.id);
  const [reviewed, setReviewed] = useState<ReviewedDraft | null>(null);
  const [reviewingFileName, setReviewingFileName] = useState<string | null>(null);
  const count = useRef(0);
  // The last draft, so a failed review can be run again without choosing the file anew. Gone with the page.
  const lastFile = useRef<File | null>(null);
  const review = (file: File) => {
    lastFile.current = file;
    setReviewingFileName(file.name);
    mutation.mutate(file, {
      onSuccess: (view) => {
        count.current += 1;
        setReviewed({ view, fileName: file.name, number: count.current });
      },
      onSettled: () => setReviewingFileName(null),
    });
  };
  return {
    reviewed,
    review,
    retry: () => {
      if (lastFile.current) review(lastFile.current);
    },
    isReviewing: mutation.isPending,
    reviewingFileName,
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
