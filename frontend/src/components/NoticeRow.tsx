import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeSummary } from "../api/types";
import { noticeDeadlineLabel, noticeDeadlineNote, sourceLabel } from "../lib/labels";
import { useIsPhone } from "../lib/usePhone";
import { Row, RowEnd, RowLink } from "./RowList";
import { FictitiousToken, FitToken, NoticeStatusToken, PublishedChecklistToken } from "./tokens";
import { DeadlineBlock } from "./ui/DeadlineBlock";

/** Joint procurements name every buyer; a row shows two, then how many more. */
const BUYERS_SHOWN = 2;

/** "Timrå kommun, Sundsvalls kommun", or "Timrå kommun + 6 till" for a long list of joint buyers. */
export function shortBuyers(buyer: string | null): string | null {
  const buyers = (buyer ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (buyers.length === 0) return null;
  if (buyers.length <= BUYERS_SHOWN) return buyers.join(", ");
  return `${buyers[0]} + ${buyers.length - 1} till`;
}

/** The source as a row names it. Demo notices leave it out, since their Fiktiv token already says it. */
function rowSource(source: string): string | null {
  return source === "fixture" ? null : sourceLabel(source);
}

/** Who buys and where the notice comes from: "Sundsvalls kommun · TED". For cards whose reasons say what it is. */
export function noticeOrigin(notice: Pick<NoticeSummary, "buyer" | "source">): string {
  return [shortBuyers(notice.buyer), rowSource(notice.source)].filter(Boolean).join(" · ");
}

/**
 * A row's metadata: "Sundsvalls kommun · Målning · TED". The category is the main CPV code's name (never a bare code).
 * The buyer's reference ("DEMO-2026-0147") stays on the notice's own page: in a row it pushed the tokens onto a line
 * of their own, and the search does not find notices by it.
 */
export function noticeMeta(notice: Pick<NoticeSummary, "buyer" | "source" | "cpv_label">): string {
  return [shortBuyers(notice.buyer), notice.cpv_label, rowSource(notice.source)].filter(Boolean).join(" · ");
}

/** Whether a row has a token to show: being open for tenders is the normal state and gets none. */
function hasTokens(notice: NoticeSummary, isStatusShown: boolean): boolean {
  return (
    (isStatusShown && notice.status !== "open") ||
    notice.fit !== null ||
    notice.checklist_status === "published" ||
    notice.is_fictitious
  );
}

/** The tokens that say something about this notice. */
function NoticeTokens({ notice, isStatusShown }: { notice: NoticeSummary; isStatusShown: boolean }) {
  return (
    <>
      {isStatusShown && <NoticeStatusToken status={notice.status} size="sm" />}
      {notice.fit && <FitToken fit={notice.fit} size="sm" />}
      {notice.checklist_status === "published" && <PublishedChecklistToken size="sm" reviewed={notice.checklist_reviewed} />}
      {notice.is_fictitious && <FictitiousToken size="sm" />}
    </>
  );
}

/**
 * The deadline column's width on wider screens: room for "30 okt" and for the "om 4 dagar" token of a notice closing
 * soon, the same on every row. A phone lets each row's column take only what it needs, so the title gets the rest.
 */
const DEADLINE_WIDTH = 112;

/**
 * Sista anbudsdag at the row's end edge, or what to expect when the notice has none. A restricted procedure's date is
 * the last day for anbudsansökan, and the row says so above it.
 */
function RowDeadline({ notice, width }: { notice: NoticeSummary; width?: number }) {
  const label = noticeDeadlineLabel(notice);
  return (
    <RowEnd width={width}>
      {notice.deadline_at ? (
        <DeadlineBlock
          deadline={notice.deadline_at}
          label={label}
          note={noticeDeadlineNote(notice.deadline_kind)}
          variant="compact"
          align="end"
        />
      ) : (
        <>
          <VisuallyHidden>{`${label}:`}</VisuallyHidden>
          <Text type="supporting">{notice.status === "planned" ? "Datum kommer" : "Inget datum"}</Text>
        </>
      )}
    </RowEnd>
  );
}

export interface NoticeRowProps {
  notice: NoticeSummary;
  /** The title's level in the page outline: 3 under the list's own h2 (default). */
  headingLevel?: 2 | 3 | 4;
  /** Leave the status token out when every row has the same status (the list shows only planned ones). */
  isStatusShown?: boolean;
}

/**
 * One notice as a compact row in a list (direction.md, section 4 "Upphandlingar"): on the left the title (semibold,
 * at most two lines) with buyer and category on one line (a long line is cut off) and only the tokens that say
 * something; on the right the deadline block.
 * The whole row is the title's link. The title stays a heading, so screen-reader users can move from notice to
 * notice; it keeps the body's line height so seven rows fit the first screen. On a phone the tokens get a line of
 * their own under both columns, so they never squeeze the title and two of them fit side by side.
 */
export function NoticeRow({ notice, headingLevel = 3, isStatusShown = true }: NoticeRowProps) {
  const isPhone = useIsPhone();
  const meta = noticeMeta(notice);
  const title = (
    <Heading level={5} accessibilityLevel={headingLevel}>
      <RowLink href={`/upphandlingar/${notice.id}`} maxLines={2}>
        {notice.title}
      </RowLink>
    </Heading>
  );
  const metaLine = meta ? (
    <Text type="supporting" maxLines={1} hasTruncateTooltip={false}>
      {meta}
    </Text>
  ) : null;
  const tokens = <NoticeTokens notice={notice} isStatusShown={isStatusShown} />;

  if (isPhone) {
    return (
      <Row isLinked>
        <VStack gap={2}>
          <HStack gap={3} vAlign="start">
            <StackItem size="fill">
              <VStack gap={1}>
                {title}
                {metaLine}
              </VStack>
            </StackItem>
            <RowDeadline notice={notice} />
          </HStack>
          {hasTokens(notice, isStatusShown) && (
            <HStack gap={2} vAlign="center" wrap="wrap">
              {tokens}
            </HStack>
          )}
        </VStack>
      </Row>
    );
  }

  return (
    <Row isLinked>
      <HStack gap={4} vAlign="center">
        <StackItem size="fill">
          <VStack gap={1}>
            {title}
            <HStack gap={2} vAlign="center" wrap="wrap">
              {metaLine}
              {tokens}
            </HStack>
          </VStack>
        </StackItem>
        <RowDeadline notice={notice} width={DEADLINE_WIDTH} />
      </HStack>
    </Row>
  );
}
