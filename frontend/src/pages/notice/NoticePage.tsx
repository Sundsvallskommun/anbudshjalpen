import { Link } from "@astryxdesign/core/Link";
import { useParams } from "react-router";
import { useNotice, useSession } from "../../api/queries";
import type { NoticeDetail, UserView } from "../../api/types";
import { CitationViewerProvider } from "../../components/citations/CitationViewer";
import { ErrorNotice, Loading } from "../../components/states";
import { UrlTabs, type TabSpec } from "../../components/UrlTabs";
import { Page } from "../../shell/Page";
import { ChecklistTab } from "./ChecklistTab";
import { DocumentsTab } from "./DocumentsTab";
import { AwardExplanation, MatchSummary, NoticeFacts } from "./NoticeHeader";
import { QuestionTab } from "./QuestionTab";
import { ReviewTab } from "./ReviewTab";
import { SubmissionTab } from "./SubmissionTab";

function NoticeTabs({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  const tabs: TabSpec[] = [
    { value: "checklista", label: "Checklista", render: () => <ChecklistTab notice={notice} user={user} /> },
    { value: "fraga", label: "Fråga underlaget", render: () => <QuestionTab notice={notice} /> },
    { value: "granska", label: "Granska utkast", render: () => <ReviewTab notice={notice} user={user} /> },
    { value: "underlag", label: "Underlag", render: () => <DocumentsTab notice={notice} user={user} /> },
    { value: "inlamning", label: "Inför inlämning", render: () => <SubmissionTab notice={notice} /> },
  ];
  return <UrlTabs tabs={tabs} idPrefix="flik" />;
}

export default function NoticePage() {
  const { id = "" } = useParams();
  const notice = useNotice(id);
  const session = useSession();
  const user = session.data?.user ?? null;

  if (notice.isPending) return <Loading label="Hämtar upphandlingen …" />;
  if (notice.isError) {
    return (
      <Page title="Upphandlingen kunde inte visas">
        <ErrorNotice title="Upphandlingen kunde inte hämtas" error={notice.error} onRetry={() => notice.refetch()} />
        <Link href="/" isStandalone>
          Till alla upphandlingar
        </Link>
      </Page>
    );
  }

  const detail = notice.data;
  return (
    <CitationViewerProvider noticeId={detail.id} documents={detail.documents}>
      <Page title={detail.title} intro={<NoticeFacts notice={detail} />}>
        {detail.status === "awarded" && <AwardExplanation />}
        <MatchSummary notice={detail} />
        <NoticeTabs notice={detail} user={user} />
      </Page>
    </CitationViewerProvider>
  );
}
