import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { useParams } from "react-router";
import { ApiError } from "../../api/client";
import { useNotice, useSession } from "../../api/queries";
import type { NoticeDetail } from "../../api/types";
import { useAskDeepLink, useRegisterNotice } from "../../components/ask/AskAiProvider";
import { ErrorNotice, Loading } from "../../components/states";
import { useSourceDeepLink } from "../../components/ui/source/SourceDialogProvider";
import { SourceDocumentsProvider } from "../../components/ui/source/SourceDocuments";
import { Page } from "../../shell/Page";
import { NoticeHeader, NoticeIntro } from "./header/NoticeHeader";
import { NoChecklist } from "./NoChecklist";
import { NoticeSteps } from "./steps/NoticeSteps";

const BREADCRUMBS = [{ label: "Upphandlingar", href: "/upphandlingar" }] as const;

/** `checkedAt` is when the notice was last fetched: the card for a checklist on its way shows it (decision 0019). */
function NoticeView({ notice, checkedAt }: { notice: NoticeDetail; checkedAt: number }) {
  const session = useSession();
  const user = session.data?.user ?? null;
  useRegisterNotice(notice);
  return (
    <SourceDocumentsProvider documents={notice.documents}>
      <Page title={notice.title} breadcrumbs={BREADCRUMBS} intro={<NoticeIntro notice={notice} />}>
        <NoticeHeader notice={notice} user={user} />
        {notice.checklist ? (
          <NoticeSteps notice={notice} view={notice.checklist} user={user} />
        ) : (
          <NoChecklist notice={notice} user={user} checkedAt={checkedAt} />
        )}
      </Page>
    </SourceDocumentsProvider>
  );
}

/**
 * A notice (direction.md, section 4 "Upphandlingens sida"): the header every step shares, then the three steps, or,
 * without a checklist, why there is none and what can be done anyway. `?citat=` or `?flik=underlag` in the address
 * opens the source dialog once the notice has loaded, and `?fraga=` opens the "Fråga AI" panel (decision 0014).
 */
export default function NoticePage() {
  const { id = "" } = useParams();
  const notice = useNotice(id);
  useSourceDeepLink(notice.data);
  useAskDeepLink(notice.data);

  if (notice.isPending) return <Loading label="Hämtar upphandlingen …" />;
  if (notice.isError) {
    // A notice that is not there is no failure to retry: say what may have happened and lead back to the list.
    if (notice.error instanceof ApiError && notice.error.status === 404) {
      return (
        <Page title="Upphandlingen finns inte" breadcrumbs={BREADCRUMBS}>
          <Card>
            <EmptyState
              headingLevel={2}
              title="Ingen upphandling på den här adressen"
              description="Den kan ha tagits bort, eller så är länken fel. Alla upphandlingar finns i listan."
              actions={<Button label="Till alla upphandlingar" href="/upphandlingar" />}
            />
          </Card>
        </Page>
      );
    }
    return (
      <Page title="Upphandlingen kunde inte visas" breadcrumbs={BREADCRUMBS}>
        <ErrorNotice title="Upphandlingen kunde inte hämtas" error={notice.error} onRetry={() => notice.refetch()} />
        <Link href="/upphandlingar" isStandalone>
          Till alla upphandlingar
        </Link>
      </Page>
    );
  }
  return <NoticeView notice={notice.data} checkedAt={notice.dataUpdatedAt} />;
}
