import { Link } from "@astryxdesign/core/Link";
import { useParams } from "react-router";
import { useAdminChecklist, useNotice } from "../../api/queries";
import { ErrorNotice, Loading } from "../../components/states";
import { Page } from "../../shell/Page";
import { RequireRole } from "../../shell/RequireRole";
import { REVIEW_TRAIL, ReviewPage } from "./review/ReviewPage";

function Review() {
  const { id = "" } = useParams();
  const checklist = useAdminChecklist(id);
  const notice = useNotice(checklist.data?.notice_id ?? "");

  if (checklist.isPending) {
    // The page's frame and heading come at once; the workspace keeps its width when the checklist arrives.
    return (
      <Page title="Granska checklista" width={1344} breadcrumbs={REVIEW_TRAIL}>
        <Loading label="Hämtar checklistan …" />
      </Page>
    );
  }
  if (checklist.isError) {
    return (
      <Page title="Checklistan kunde inte visas" breadcrumbs={REVIEW_TRAIL}>
        <ErrorNotice title="Checklistan kunde inte hämtas" error={checklist.error} onRetry={() => checklist.refetch()} />
        <Link href="/inkop" isStandalone>
          Till Att granska
        </Link>
      </Page>
    );
  }
  // A new checklist (the next one in the queue) starts with its own working copy, marks and selection.
  return <ReviewPage key={checklist.data.id} view={checklist.data} notice={notice.data} />;
}

/**
 * The buyer's review of one checklist (direction.md, section 4 "Inköp: Granska checklista"). Its toasts ("Ångra",
 * "Granska nästa") show in the app's one toast layer (AppProviders), inside the theme and the router.
 */
export default function ChecklistReviewPage() {
  return <RequireRole role="inkopare" title="Granska checklista">{() => <Review />}</RequireRole>;
}
