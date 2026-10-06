import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, useState } from "react";
import type { Fit, MatchReason, MatchView } from "../../../api/types";
import { withoutEnginePrefix } from "../../../components/checklist/checklistModel";
import { AiProvenance } from "../../../components/ui/AiProvenance";
import { requirementAnchor } from "../../../components/ui/RequirementRow";
import { SourceLink } from "../../../components/ui/source/SourceLink";
import { REASON_KIND } from "../../../lib/labels";

/** At most three reasons first (direction.md, section 6 "MatchCard"); the rest behind "Visa alla skäl (n)". */
const SHOWN_REASONS = 3;

/** The disclosure's words by the fit: "Därför verkar den passa (4 skäl)". */
export const FIT_HEADING: Record<Fit, string> = {
  passar: "Därför verkar den passa",
  passar_delvis: "Därför passar den delvis",
  passar_inte: "Därför verkar den inte passa",
};

const REASON_ICON: Record<MatchReason["kind"], { icon: "success" | "error" | "warning"; color: "success" | "error" | "warning" }> = {
  styrka: { icon: "success", color: "success" },
  hinder: { icon: "error", color: "error" },
  oklart: { icon: "warning", color: "warning" },
};

/** Said when there is no checklist to compare the profile with (direction.md, "Upphandling utan checklista"). */
const WITHOUT_CHECKLIST = "Bedömt bara på CPV-kod och ord i annonsen. Det finns ingen granskad checklista att jämföra med.";

function Reason({
  reason,
  noticeId,
  documentId,
  origin,
  requirementTitle,
}: {
  reason: MatchReason;
  noticeId: string;
  documentId?: string;
  origin: string;
  /** The title of the checklist requirement the reason is about, when step 1 lists it; the reason then links to it. */
  requirementTitle?: string;
}) {
  const look = REASON_ICON[reason.kind];
  return (
    <HStack as="li" gap={2} vAlign="start">
      <Icon icon={look.icon} color={look.color} size="md" />
      <Text>
        {/* What speaks for the notice needs no word in front; the rest is said, not only shown (WCAG 1.4.1). */}
        {reason.kind === "styrka" ? (
          <VisuallyHidden>{`${REASON_KIND.styrka}: `}</VisuallyHidden>
        ) : (
          <Text weight="semibold">{`${REASON_KIND[reason.kind]}: `}</Text>
        )}
        {reason.text}
        {reason.citation && (
          <>
            {" "}
            <SourceLink
              noticeId={noticeId}
              citation={reason.citation}
              claim={reason.text}
              origin={origin}
              documentId={documentId}
              isInline
            />
          </>
        )}
        {reason.requirement_id && requirementTitle && (
          <>
            {" · "}
            <Link
              href={`?flik=checklista#${requirementAnchor(reason.requirement_id)}`}
              label={`Visa kravet ”${requirementTitle}”`}
              size="sm"
              hasUnderline
            >
              Visa kravet
            </Link>
          </>
        )}
      </Text>
    </HStack>
  );
}

/**
 * Why the notice seems to fit the company, with each reason's source: at most three first, the engine named once in
 * the provenance line (matches are never reviewed by inköp). A reason about a requirement links to its row in step 1
 * (direction.md, section 4: "#krav-K12"). Without a published checklist the reasons rest on the CPV codes and the
 * notice's words only, and the list says so.
 */
export function FitReasons({
  match,
  noticeId,
  documentId,
  hasChecklist,
  requirementTitles = new Map(),
}: {
  match: MatchView;
  noticeId: string;
  documentId?: string;
  hasChecklist: boolean;
  /** The titles of the requirements step 1 lists, by id. */
  requirementTitles?: ReadonlyMap<string, string>;
}) {
  const [showsAll, setShowsAll] = useState(false);
  const listId = useId();
  const reasons = match.assessment.reasons;
  const shown = showsAll ? reasons : reasons.slice(0, SHOWN_REASONS);
  const origin = FIT_HEADING[match.fit];
  return (
    <VStack gap={3} hAlign="start">
      <AiProvenance
        engine={match.engine}
        howLabel="Hur gjordes bedömningen?"
        details={<Text as="p">{withoutEnginePrefix(match.assessment.summary)}</Text>}
      />
      <VStack as="ul" role="list" id={listId} gap={2}>
        {shown.map((reason, index) => (
          <Reason
            key={index}
            reason={reason}
            noticeId={noticeId}
            documentId={documentId}
            origin={origin}
            requirementTitle={reason.requirement_id ? requirementTitles.get(reason.requirement_id) : undefined}
          />
        ))}
        {!hasChecklist && (
          <HStack as="li" gap={2} vAlign="start">
            <Icon icon="info" color="secondary" size="md" />
            <Text color="secondary">{WITHOUT_CHECKLIST}</Text>
          </HStack>
        )}
      </VStack>
      {reasons.length > SHOWN_REASONS && (
        <Button
          label={showsAll ? "Visa färre skäl" : `Visa alla skäl (${reasons.length})`}
          variant="ghost"
          size="sm"
          aria-expanded={showsAll}
          aria-controls={listId}
          onClick={() => setShowsAll(!showsAll)}
        />
      )}
    </VStack>
  );
}
