import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { MouseEvent } from "react";
import { SectionRows } from "../../../../components/checklist/SectionRow";
import { StatusToken } from "../../../../components/tokens";
import { CollapsibleSection } from "../../../../components/ui/CollapsibleSection";
import { requirementAnchor } from "../../../../components/ui/RequirementRow";
import { SourceLink } from "../../../../components/ui/source/SourceLink";
import { useAskAi } from "../../../../components/ask/AskAiProvider";
import { REQUIREMENT_KINDS } from "../../../../lib/labels";
import { keepNumbersTogether } from "../../../../lib/text";
import { draftSource, questionAbout, type ReviewGroup, type ReviewItem } from "./reviewModel";
import styles from "./ReviewRow.module.css";

const KIND_LABEL = Object.fromEntries(REQUIREMENT_KINDS.map(({ kind, label }) => [kind, label]));

/** A plain click stays on the page; one that asks for a new tab or window follows the address. */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function ReviewRow({
  item,
  group,
  noticeId,
  documentId,
}: {
  item: ReviewItem;
  group: ReviewGroup;
  noticeId: string;
  documentId?: string;
}) {
  const askAi = useAskAi();
  const { check, requirement, title } = item;
  const isActionable = group.id === "atgarda" || group.id === "kontrollera";
  const comment = group.helper === check.comment.trim() ? null : check.comment;
  const question = questionAbout(title);
  return (
    <VStack as="li" gap={2} hAlign="start" className={group.id === "atgarda" ? `${styles.row} ${styles.urgent}` : styles.row}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StatusToken status={check.status} size="sm" />
        {requirement && !group.isNeutral && <Token label={KIND_LABEL[requirement.kind] ?? requirement.kind} color="gray" size="sm" />}
      </HStack>
      <Text weight="semibold">{keepNumbersTogether(title)}</Text>
      {comment && <Text>{comment}</Text>}
      {isActionable && requirement?.evidence && (
        <Text>
          <Text weight="semibold">Så visar du det:</Text> {requirement.evidence}
        </Text>
      )}
      {check.draft_quote && <Text type="supporting">{`${draftSource(check)}: ”${check.draft_quote}”`}</Text>}
      <HStack gap={4} vAlign="center" wrap="wrap">
        {requirement && (
          <>
            <Link href={`?flik=checklista#${requirementAnchor(requirement.id)}`} label={`Visa kravet ”${title}”`} isStandalone size="sm">
              Visa kravet
            </Link>
            <SourceLink
              noticeId={noticeId}
              citation={requirement.citation}
              claim={title}
              origin={`Granskningen: ${group.title}`}
              documentId={documentId}
            />
          </>
        )}
        {isActionable && (
          // A link like its neighbours: its address opens the "Fråga AI" panel with the question, also in a new tab.
          <Link
            href={`?${new URLSearchParams({ fraga: question })}`}
            label={`Fråga om kravet ”${title}”`}
            isStandalone
            size="sm"
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              askAi.open({ question });
            }}
          >
            Fråga om kravet
          </Link>
        )}
      </HStack>
    </VStack>
  );
}

/**
 * One group of the review as a section card with its count ("Bör åtgärdas, 3 krav"). A comment all its rows share is
 * said once, under the heading. `value` lets the result's filters open the group.
 */
export function ReviewGroupSection({ group, noticeId, documentId }: { group: ReviewGroup; noticeId: string; documentId?: string }) {
  if (group.items.length === 0) return null;
  return (
    <CollapsibleSection
      id={`granskning-${group.id}`}
      title={group.title}
      count={group.items.length}
      countNoun={group.countNoun}
      helper={group.helper ?? undefined}
      defaultOpen={group.defaultOpen}
      value={group.id}
    >
      <SectionRows>
        {group.items.map((item) => (
          <ReviewRow key={item.check.requirement_id} item={item} group={group} noticeId={noticeId} documentId={documentId} />
        ))}
      </SectionRows>
    </CollapsibleSection>
  );
}
