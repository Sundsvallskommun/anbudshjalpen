import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNotices, useProfile, useSession } from "../api/queries";
import type { UserView } from "../api/types";
import { Loading } from "../components/states";
import { PublishedChecklistToken } from "../components/tokens";
import { useIsPhone } from "../lib/usePhone";
import { Page } from "../shell/Page";
import { NoticeFilterBar, type FitOption, type SortOption } from "./notices/NoticeFilterBar";
import { NoticeResults } from "./notices/NoticeResults";
import { NoticesRail } from "./notices/NoticesRail";
import { currentSort, toBuyerFilters, toNoticeFilters, useListState } from "./notices/listState";

const TITLE = "Upphandlingar";

/**
 * One line of intro (direction.md, section 4 "Upphandlingar"). A phone leaves out the first sentence, which the
 * heading and the rows already say, so the explanation of the token takes two lines instead of three.
 */
function Intro() {
  const isPhone = useIsPhone();
  return (
    <Text as="p" color="secondary">
      {isPhone ? "De som är märkta " : "Kommunens och regionens upphandlingar. De som är märkta "}
      <PublishedChecklistToken size="sm" /> har full hjälp: krav, frågor och granskning.
    </Text>
  );
}

/** The page's frame while what it depends on (the session, a company's profile) is on its way. */
function PendingPage({ label }: { label: string }) {
  return (
    <Page title={TITLE} intro={<Intro />}>
      <Loading label={label} />
    </Page>
  );
}

function NoticeBrowser({
  viewer,
  fit,
  profileCpvCodes,
}: {
  viewer: UserView | null;
  fit: FitOption | null;
  profileCpvCodes: readonly string[] | null;
}) {
  const { state, update } = useListState();
  const filters = toNoticeFilters(state, profileCpvCodes);
  const query = useNotices(filters);
  const sort: SortOption | null =
    (query.data?.total ?? 0) > 1
      ? { value: currentSort(state, query.data), onChange: (next) => update({ sort: next }) }
      : null;
  return (
    <Page
      title={TITLE}
      intro={
        <VStack gap={3}>
          <Intro />
          <NoticeFilterBar
            state={state}
            counts={query.data?.counts}
            buyerFilters={toBuyerFilters(filters)}
            fit={fit}
            sort={sort}
            onChange={update}
          />
        </VStack>
      }
      rail={<NoticesRail viewer={viewer} />}
      railLabel={viewer?.role === "foretagare" ? "För ert företag" : "Mer om upphandlingarna"}
    >
      <NoticeResults state={state} query={query} onChange={update} />
    </Page>
  );
}

/**
 * A company also gets "Visa bara det som passar er", which filters on its profile's CPV codes. With the switch on in
 * the address, the list waits for the profile, so it never shows unfiltered rows under a switch that is on.
 */
function CompanyNotices({ viewer }: { viewer: UserView }) {
  const profile = useProfile();
  const { state } = useListState();
  if (profile.isPending && state.isFitOnly) return <PendingPage label="Hämtar er profil …" />;
  const codes = profile.data?.cpv_codes ?? [];
  const fit: FitOption | null = profile.data
    ? {
        labels: codes.map((code) => profile.data.cpv_labels[code]).filter((label): label is string => Boolean(label)),
        isAvailable: codes.length > 0,
      }
    : null;
  return <NoticeBrowser viewer={viewer} fit={fit} profileCpvCodes={codes} />;
}

/**
 * Upphandlingar (direction.md, section 4): every notice, searchable, with the open ones first and sorted by how soon
 * they close. Each row is one link with the deadline at its end; fit shows only for a signed-in company.
 */
export function NoticesPage() {
  const session = useSession();
  if (session.isPending) return <PendingPage label="Hämtar sidan …" />;
  const viewer = session.data?.user ?? null;
  if (viewer?.role === "foretagare") return <CompanyNotices viewer={viewer} />;
  return <NoticeBrowser viewer={viewer} fit={null} profileCpvCodes={null} />;
}
