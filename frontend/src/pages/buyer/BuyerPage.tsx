import { Button } from "@astryxdesign/core/Button";
import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAdminChecklists } from "../../api/queries";
import { UrlTabs } from "../../components/UrlTabs";
import { toReviewCount } from "../../shell/navigation";
import { Page } from "../../shell/Page";
import { RequireRole } from "../../shell/RequireRole";
import { CompanyQuestions } from "./CompanyQuestions";
import { NewNoticeDialog } from "./NewNoticeDialog";
import { PossibleBidders } from "./PossibleBidders";
import { ReviewQueue } from "./ReviewQueue";

/** Addresses from before the redesign: `?flik=ny` opens "Ny upphandling", `?flik=jobb` moved to Drift. */
const NEW_NOTICE_STEP = "ny";
const JOBS_STEP = "jobb";

function Buyer() {
  const [params, setParams] = useSearchParams();
  const step = params.get("flik");
  const [isCreating, setIsCreating] = useState(step === NEW_NOTICE_STEP);
  const checklists = useAdminChecklists("all");
  const toReview = checklists.data ? toReviewCount(checklists.data) : null;

  if (step === JOBS_STEP) return <Navigate to="/inkop/drift" replace />;

  const closeNewNotice = () => {
    setIsCreating(false);
    if (step === NEW_NOTICE_STEP) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("flik");
          return next;
        },
        { replace: true },
      );
    }
  };

  return (
    <Page
      title="Inköp"
      intro="Granska checklistor innan företagen ser dem, följ vad företagen frågar om, och se vilka företag som kan svara på ett tänkt uppdrag."
      actions={<Button label="Ny upphandling" onClick={() => setIsCreating(true)} />}
    >
      <UrlTabs
        idPrefix="inkop"
        tabs={[
          {
            value: "granska",
            label: toReview === null ? "Att granska" : `Att granska (${toReview})`,
            render: () => <ReviewQueue />,
          },
          { value: "insikter", label: "Företagens frågor", render: () => <CompanyQuestions /> },
          { value: "anbudsgivare", label: "Möjliga anbudsgivare", render: () => <PossibleBidders /> },
        ]}
      />
      <NewNoticeDialog isOpen={isCreating} onClose={closeNewNotice} />
    </Page>
  );
}

/**
 * Inköp (direction.md, section 3 and 4): the checklists to review, what companies ask about and which companies could
 * answer a job inköp is considering (decision 0023), with "Ny upphandling" in the header. The scheduled jobs are on
 * Drift, reached from the account menu.
 */
export default function BuyerPage() {
  return <RequireRole role="inkopare" title="Inköp">{() => <Buyer />}</RequireRole>;
}
