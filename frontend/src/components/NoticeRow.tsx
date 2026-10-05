import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeSummary } from "../api/types";
import { formatDateTime, relativeDeadline } from "../lib/format";
import { sourceLabel } from "../lib/labels";
import { FictitiousToken, FitToken, NoticeStatusToken } from "./tokens";

/** Who buys and where the notice comes from: "Sundsvalls kommun · TED". */
export function noticeOrigin(notice: Pick<NoticeSummary, "buyer" | "source">): string {
  return [notice.buyer, sourceLabel(notice.source)].filter(Boolean).join(" · ");
}

/** The deadline with how far away it is, or nothing when the notice has none. */
export function DeadlineText({ deadline, label = "Sista anbudsdag" }: { deadline: string | null; label?: string }) {
  if (!deadline) return null;
  return (
    <Text>
      {label}: <Text weight="semibold">{formatDateTime(deadline)}</Text> ({relativeDeadline(deadline)})
    </Text>
  );
}

/** One notice in a list: the title links to it, then buyer, status, fit and deadline. */
export function NoticeRow({ notice, headingLevel = 2 }: { notice: NoticeSummary; headingLevel?: 2 | 3 }) {
  return (
    <VStack gap={2}>
      <Heading level={headingLevel}>
        <Link href={`/upphandlingar/${notice.id}`}>{notice.title}</Link>
      </Heading>
      <Text color="secondary">{noticeOrigin(notice)}</Text>
      <HStack gap={2} wrap="wrap">
        {notice.fit && <FitToken fit={notice.fit} />}
        <NoticeStatusToken status={notice.status} />
        {notice.checklist_status === "published" && <Token label="Checklista finns" color="cyan" />}
        {notice.is_fictitious && <FictitiousToken />}
      </HStack>
      <DeadlineText deadline={notice.deadline_at} />
    </VStack>
  );
}
