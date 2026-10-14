import { CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, useState, type Ref } from "react";
import type { AttachmentCheck, Checklist, ReviewView } from "../../../../api/types";
import { AiProvenance } from "../../../../components/ui/AiProvenance";
import { ResultSummary } from "../../../../components/ui/ResultSummary";
import { ReviewGroupSection } from "./ReviewGroupSection";
import {
  attachedCount,
  attachmentStatusText,
  attachmentVerdicts,
  REVIEW_GROUP_ORDER,
  reviewGroups,
  reviewVerdict,
  type AttachmentVerdict,
  type ReviewGroupId,
} from "./reviewModel";

/** The result's filters (direction.md, section 4): what to fix, what to check, what looks fine, and the rest. */
type FilterValue = "atgarda" | "kontrollera" | "bra" | "ovriga";

const FILTER_GROUPS: Record<FilterValue, readonly ReviewGroupId[]> = {
  atgarda: ["atgarda"],
  kontrollera: ["kontrollera"],
  bra: ["bra"],
  ovriga: ["uppdraget", "villkor"],
};

const CHIP_LOOK: Record<AttachmentCheck["status"], { color: "green" | "red" | "gray"; icon: "success" | "error" | "info" }> = {
  bifogad: { color: "green", icon: "success" },
  saknas: { color: "red", icon: "error" },
  oklart: { color: "gray", icon: "info" },
};

/** "Bilagor i utkastet: 3 av 5", with a chip per attachment to hand in, named as step 1 names it. */
function AttachmentChips({ verdicts }: { verdicts: readonly AttachmentVerdict[] }) {
  const labelId = useId();
  const { attached, total } = attachedCount(verdicts);
  return (
    <VStack gap={3}>
      <Divider />
      <Text type="supporting" weight="semibold" color="primary" id={labelId}>
        {`Bilagor i utkastet: ${attached} av ${total}`}
      </Text>
      <HStack as="ul" role="list" aria-labelledby={labelId} gap={2} wrap="wrap">
        {verdicts.map((verdict, index) => {
          const look = CHIP_LOOK[verdict.status];
          return (
            <li key={`${index}-${verdict.name}`}>
              <Token label={verdict.name} color={look.color} size="sm" icon={<Icon icon={look.icon} size="sm" />} />
              <VisuallyHidden>{`, ${attachmentStatusText(verdict)}`}</VisuallyHidden>
            </li>
          );
        })}
      </HStack>
    </VStack>
  );
}

/**
 * The review's answer first (direction.md, section 4 "Steg 3 Granska"): how many things must be fixed, how many skall-
 * and kvalificeringskrav look fine, figures that filter the groups, and the draft's attachments. Then the groups, Måste
 * åtgärdas open and the rest closed, and the provenance line at the end.
 */
export function ReviewResult({
  view,
  checklist,
  noticeId,
  documentId,
  titleRef,
}: {
  view: ReviewView;
  checklist: Checklist;
  noticeId: string;
  documentId?: string;
  /** The verdict's heading, which takes the focus when a result arrives. */
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const groups = reviewGroups(view, checklist);
  const verdict = reviewVerdict(groups);
  const attachments = attachmentVerdicts(checklist.attachments, view.result.attachments);
  const [filter, setFilter] = useState<FilterValue | null>(null);
  const [open, setOpen] = useState<string[]>(() => groups.filter((group) => group.defaultOpen).map((group) => group.id));
  const count = (id: ReviewGroupId) => groups.find((group) => group.id === id)?.items.length ?? 0;
  const filters = [
    { value: "atgarda", label: "Bör åtgärdas", count: count("atgarda") },
    { value: "kontrollera", label: "Kontrollera själv", count: count("kontrollera") },
    { value: "bra", label: "Ser bra ut", count: count("bra") },
    { value: "ovriga", label: "Övriga krav", count: verdict.others },
  ].filter((candidate) => candidate.count > 0);
  const shownIds = filter ? FILTER_GROUPS[filter] : REVIEW_GROUP_ORDER;

  const choose = (value: string | null) => {
    const next = (value as FilterValue | null) ?? null;
    setFilter(next);
    // A group chosen to be seen alone is opened.
    if (next) setOpen((previous) => [...new Set([...previous, ...FILTER_GROUPS[next]])]);
  };

  return (
    <VStack gap={4}>
      <ResultSummary
        title={verdict.title}
        headingLevel={3}
        titleRef={titleRef}
        progress={
          verdict.essential > 0
            ? {
                value: verdict.good,
                max: verdict.essential,
                label: `${verdict.good} av ${verdict.essential} skall- och kvalificeringskrav ser bra ut`,
              }
            : undefined
        }
        filters={filters}
        selected={filter}
        onSelectedChange={choose}
      >
        {attachments.length > 0 && <AttachmentChips verdicts={attachments} />}
      </ResultSummary>
      <CollapsibleGroup type="multiple" value={open} onChange={(value) => setOpen(Array.isArray(value) ? value : [value])}>
        {groups
          .filter((group) => shownIds.includes(group.id))
          .map((group) => (
            <ReviewGroupSection key={group.id} group={group} noticeId={noticeId} documentId={documentId} />
          ))}
      </CollapsibleGroup>
      <AiProvenance
        engine={view.engine}
        howLabel="Hur gick granskningen till?"
        details={<Text as="p">{view.result.summary}</Text>}
        usage={view.usage}
      />
    </VStack>
  );
}
