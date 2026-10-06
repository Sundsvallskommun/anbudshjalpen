import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { useRef, useState } from "react";
import { useReviewDraft } from "../../../api/queries";
import type { ChecklistView, NoticeDetail, UserView } from "../../../api/types";
import { DeadlineBlock } from "../../../components/ui/DeadlineBlock";
import { ArrowRightIcon } from "../../../components/ui/icons";
import { NextStepCard } from "../../../components/ui/NextStepCard";
import { StepNav, useStepNav, type StepMark, type StepValue } from "../../../components/ui/StepNav";
import { QuestionStep } from "./question/QuestionStep";
import { RequirementsStep } from "./requirements/RequirementsStep";
import { reviewGroups, reviewVerdict } from "./review/reviewModel";
import { ReviewStep, type ReviewControls, type ReviewedDraft } from "./review/ReviewStep";
import { SubmitStep } from "./submit/SubmitStep";

/** "Nästa steg" at the end of step 2: on to the review. */
function QuestionStepEnd() {
  const { goTo } = useStepNav();
  return (
    <NextStepCard
      text="Har du ett utkast till anbud? Låt Anbudsklar jämföra det med kraven."
      action={<Button label="Gå till steg 3 Granska" endContent={<Icon icon={ArrowRightIcon} />} onClick={() => goTo("granska")} />}
    />
  );
}

/**
 * The latest review of this visit, above the steps: step 3 shows it, step 4 ticks what it found and the step bar marks
 * step 3. The draft itself is never kept; only the result is, until the page is left.
 */
function useReview(notice: NoticeDetail): ReviewControls {
  const mutation = useReviewDraft(notice.id);
  const [reviewed, setReviewed] = useState<ReviewedDraft | null>(null);
  const count = useRef(0);
  return {
    reviewed,
    review: (file) =>
      mutation.mutate(file, {
        onSuccess: (view) => {
          count.current += 1;
          setReviewed({ view, fileName: file.name, number: count.current });
        },
      }),
    isReviewing: mutation.isPending,
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
 * The four steps of a notice with a checklist (direction.md, section 4): 1 Krav, 2 Fråga, 3 Granska and 4 Lämna in in
 * a sticky bar, with sista anbudsdag at its end once it has stuck. Step 3 is marked when a review found gaps, or when
 * everything looked fine.
 */
export function NoticeSteps({ notice, view, user }: { notice: NoticeDetail; view: ChecklistView; user: UserView | null }) {
  const review = useReview(notice);
  const mark = reviewMark(review.reviewed, view);
  const marks: Partial<Record<StepValue, StepMark>> = mark ? { granska: mark } : {};
  return (
    <StepNav
      marks={marks}
      end={notice.deadline_at ? <DeadlineBlock deadline={notice.deadline_at} label="Sista anbudsdag" variant="inline" /> : undefined}
      panels={{
        checklista: () => <RequirementsStep notice={notice} view={view} user={user} />,
        fraga: () => <QuestionStep notice={notice} nextStep={<QuestionStepEnd />} />,
        granska: () => <ReviewStep notice={notice} view={view} user={user} controls={review} />,
        inlamning: () => <SubmitStep notice={notice} view={view} review={review.reviewed?.view ?? null} />,
      }}
    />
  );
}
