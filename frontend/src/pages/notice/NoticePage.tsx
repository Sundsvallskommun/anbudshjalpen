import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { useParams } from "react-router";
import { ApiError } from "../../api/client";
import { useNotice, useSession } from "../../api/queries";
import type { NoticeDetail } from "../../api/types";
import { ErrorNotice, Loading } from "../../components/states";
import { useSourceDeepLink } from "../../components/ui/source/SourceDialogProvider";
import { Page } from "../../shell/Page";
import { NoticeHeader, NoticeIntro } from "./header/NoticeHeader";
import { NoChecklist } from "./NoChecklist";
import { NoticeSteps } from "./steps/NoticeSteps";

const BREADCRUMBS = [{ label: "Upphandlingar", href: "/upphandlingar" }] as const;

function NoticeView({ notice }: { notice: NoticeDetail }) {
  const session = useSession();
  const user = session.data?.user ?? null;
  return (
    <Page title={notice.title} breadcrumbs={BREADCRUMBS} intro={<NoticeIntro notice={notice} />}>
      <NoticeHeader notice={notice} user={user} />
      {notice.checklist ? (
        <NoticeSteps notice={notice} view={notice.checklist} user={user} />
      ) : (
        <NoChecklist notice={notice} user={user} />
      )}
    </Page>
  );
}

/**
 * A notice (direction.md, section 4 "Upphandlingens sida"): the header every step shares, then the four steps, or,
 * without a checklist, why there is none and what can be done anyway. `?citat=` or `?flik=underlag` in the address
 * opens the source dialog once the notice has loaded.
 */
export default function NoticePage() {
  const { id = "" } = useParams();
  const notice = useNotice(id);
  useSourceDeepLink(notice.data);

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
  return <NoticeView notice={notice.data} />;
}
