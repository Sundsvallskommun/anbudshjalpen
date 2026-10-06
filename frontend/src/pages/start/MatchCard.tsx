import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import type { Fit, MatchReason, MatchView } from "../../api/types";
import { noticeOrigin } from "../../components/NoticeRow";
import { RowEnd } from "../../components/RowList";
import { FictitiousToken, FitToken, PublishedChecklistToken } from "../../components/tokens";
import { AiProvenance } from "../../components/ui/AiProvenance";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { ArrowRightIcon } from "../../components/ui/icons";
import { SourceLink } from "../../components/ui/source/SourceLink";
import { REASON_KIND } from "../../lib/labels";
import { useIsPhone } from "../../lib/usePhone";
import { withoutEngineLead } from "./start";

/** A card shows three reasons; "Visa alla skäl (n)" shows the rest (direction.md, section 4 "Start"). */
export const REASONS_SHOWN = 3;

const REASONS_HEADING: Record<Fit, string> = {
  passar: "Därför verkar den passa",
  passar_delvis: "Därför passar den delvis",
  passar_inte: "Därför verkar den inte passa",
};

/** Without a published checklist the engine has only the notice to go on, and the reader should know. */
export const NO_CHECKLIST_REASON =
  "Bedömt bara på CPV-kod och ord i annonsen. Det finns ingen granskad checklista att jämföra med.";

type ReasonIcon = "success" | "error" | "warning";

/** Each kind of reason has its icon and colour, and all but a strength lead with words: never colour alone. */
const REASON_LOOK: Record<MatchReason["kind"], { icon: ReasonIcon; lead: string | null }> = {
  styrka: { icon: "success", lead: null },
  hinder: { icon: "error", lead: REASON_KIND.hinder },
  oklart: { icon: "warning", lead: REASON_KIND.oklart },
};

/** A reason line: the icon centred on the first line of text. */
function ReasonLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <HStack as="li" gap={2} vAlign="start">
      <HStack height={24} vAlign="center">
        {icon}
      </HStack>
      <StackItem size="fill">
        <Text as="p">{children}</Text>
      </StackItem>
    </HStack>
  );
}

function Reasons({ match }: { match: MatchView }) {
  const [isAll, setIsAll] = useState(false);
  const headingId = useId();
  const listId = useId();
  const { reasons } = match.assessment;
  const heading = REASONS_HEADING[match.fit];
  const shown = isAll ? reasons : reasons.slice(0, REASONS_SHOWN);
  const hasChecklist = match.notice.checklist_status === "published";
  if (reasons.length === 0 && hasChecklist) return null;

  return (
    <VStack gap={2} hAlign="start">
      <Heading level={5} accessibilityLevel={4} id={headingId} color="secondary">
        {heading}
      </Heading>
      <VStack as="ul" role="list" id={listId} aria-labelledby={headingId} gap={2}>
        {shown.map((reason, index) => {
          const look = REASON_LOOK[reason.kind];
          return (
            <ReasonLine key={index} icon={<Icon icon={look.icon} color={look.icon} size="md" />}>
              {look.lead && <Text weight="semibold">{`${look.lead}: `}</Text>}
              {reason.text}
              {reason.citation && (
                <>
                  {" "}
                  <SourceLink
                    noticeId={match.notice.id}
                    citation={reason.citation}
                    claim={reason.text}
                    origin={heading}
                    isInline
                  />
                </>
              )}
            </ReasonLine>
          );
        })}
        {!hasChecklist && (
          <ReasonLine icon={<Icon icon="info" color="secondary" size="md" />}>
            <Text color="secondary">{NO_CHECKLIST_REASON}</Text>
          </ReasonLine>
        )}
      </VStack>
      {reasons.length > REASONS_SHOWN && (
        <Button
          label={isAll ? "Visa färre skäl" : `Visa alla skäl (${reasons.length})`}
          variant="ghost"
          size="sm"
          aria-expanded={isAll}
          aria-controls={listId}
          onClick={() => setIsAll((value) => !value)}
        />
      )}
    </VStack>
  );
}

/**
 * Who buys and the checklist: "Sundsvalls kommun · Granskad checklista", or "… · TED · Ingen checklista ännu". The
 * category is left out, since the first reason says what the procurement is about.
 */
function Facts({ match }: { match: MatchView }) {
  const { notice } = match;
  const hasChecklist = notice.checklist_status === "published";
  const meta = [noticeOrigin(notice), hasChecklist ? null : "Ingen checklista ännu"].filter(Boolean).join(" · ");
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {meta && <Text type="supporting">{meta}</Text>}
      {hasChecklist && <PublishedChecklistToken size="sm" />}
    </HStack>
  );
}

/** The ref Astryx's Link takes: an anchor, or a button when it has no address. */
type TitleRef = Ref<HTMLAnchorElement | HTMLButtonElement>;

function Title({ match, id, titleRef }: { match: MatchView; id: string; titleRef: TitleRef }) {
  const isPhone = useIsPhone();
  return (
    <Heading level={3} id={id}>
      <Link
        ref={titleRef}
        href={`/upphandlingar/${match.notice.id}`}
        size={isPhone ? "base" : "lg"}
        weight="semibold"
      >
        {match.notice.title}
      </Link>
    </Heading>
  );
}

/**
 * "Sista anbudsdag 9 nov kl. 23:59 · om 35 dagar" on one line of a phone's card: the words are supporting text, so the
 * date stays the line's weight and the line fits 390 px. Screen readers hear the block's own label once.
 */
function PhoneDeadline({ deadline }: { deadline: string }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Text type="supporting" aria-hidden="true">
        Sista anbudsdag
      </Text>
      <DeadlineBlock deadline={deadline} label="Sista anbudsdag" isLabelHidden variant="inline" />
    </HStack>
  );
}

function Header({
  match,
  titleId,
  titleRef,
}: {
  match: MatchView;
  titleId: string;
  titleRef: TitleRef;
}) {
  const isPhone = useIsPhone();
  const { notice } = match;
  const tokens = (
    <HStack gap={2} wrap="wrap">
      <FitToken fit={match.fit} />
      {notice.is_fictitious && <FictitiousToken />}
    </HStack>
  );
  const about = (
    <VStack gap={1}>
      <Title match={match} id={titleId} titleRef={titleRef} />
      <Facts match={match} />
    </VStack>
  );
  if (isPhone) {
    return (
      <VStack gap={3}>
        <VStack gap={2}>
          {tokens}
          {about}
        </VStack>
        {notice.deadline_at && <PhoneDeadline deadline={notice.deadline_at} />}
      </VStack>
    );
  }
  return (
    <HStack gap={6} vAlign="start">
      <StackItem size="fill">
        <VStack gap={2}>
          {tokens}
          {about}
        </VStack>
      </StackItem>
      {notice.deadline_at && (
        <RowEnd>
          <DeadlineBlock deadline={notice.deadline_at} label="Sista anbudsdag" align="end" />
        </RowEnd>
      )}
    </HStack>
  );
}

export interface MatchCardProps {
  match: MatchView;
  onDismiss: () => void;
  isDismissing: boolean;
  /** Take the focus on mount: the card is back after "Ångra", and the button that brought it back is gone. */
  hasFocus?: boolean;
  onFocused?: () => void;
}

/**
 * One match as a card (direction.md, section 6 "MatchCard"): fit, title, the deadline block, at most three reasons
 * in plain words with their sources, the way into the notice (secondary, as it repeats in the list), "Inte
 * intressant", and the provenance line once, in the card's foot.
 */
export function MatchCard({ match, onDismiss, isDismissing, hasFocus = false, onFocused }: MatchCardProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  const { notice } = match;
  const open = notice.checklist_status === "published" ? "Öppna checklistan" : "Öppna upphandlingen";

  useEffect(() => {
    if (!hasFocus) return;
    titleRef.current?.focus();
    onFocused?.();
  }, [hasFocus]);

  return (
    <Card>
      <VStack as="article" aria-labelledby={titleId} gap={4}>
        <Header match={match} titleId={titleId} titleRef={titleRef} />
        <Reasons match={match} />
        <Divider isFullBleed />
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={2} wrap="wrap">
            <Button
              label={`${open}: ${notice.title}`}
              href={`/upphandlingar/${notice.id}`}
              endContent={<Icon icon={ArrowRightIcon} />}
            >
              {open}
            </Button>
            <Button
              label={`Inte intressant: ${notice.title}`}
              variant="ghost"
              icon={<Icon icon="close" />}
              isLoading={isDismissing}
              onClick={onDismiss}
            >
              Inte intressant
            </Button>
          </HStack>
          <AiProvenance
            engine={match.engine}
            details={<Text as="p">{withoutEngineLead(match.assessment.summary)}</Text>}
          />
        </HStack>
      </VStack>
    </Card>
  );
}
