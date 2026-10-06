import type { Requirement, TermExplanation } from "../../api/types";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { RequirementRow } from "../ui/RequirementRow";
import type { RequirementSection } from "./checklistModel";
import { SectionRows } from "./SectionRow";

/**
 * One kind of requirement as a section card with its count in the heading ("Skallkrav, 11 krav"): compact rows with
 * the title, the evidence and "s. 5". Skallkrav and kvalificeringskrav start open, the rest closed.
 */
export function RequirementGroup({
  section,
  requirements,
  noticeId,
  documentId,
  terms,
}: {
  section: RequirementSection;
  requirements: readonly Requirement[];
  noticeId: string;
  documentId?: string;
  terms?: readonly TermExplanation[];
}) {
  if (requirements.length === 0) return null;
  return (
    <CollapsibleSection
      id={section.id}
      title={section.title}
      count={requirements.length}
      countNoun={section.countNoun}
      helper={section.helper}
      defaultOpen={section.defaultOpen}
      value={section.id}
    >
      <SectionRows>
        {requirements.map((requirement) => (
          <RequirementRow
            key={requirement.id}
            requirement={requirement}
            noticeId={noticeId}
            documentId={documentId}
            origin={section.title}
            terms={terms}
          />
        ))}
      </SectionRows>
    </CollapsibleSection>
  );
}
