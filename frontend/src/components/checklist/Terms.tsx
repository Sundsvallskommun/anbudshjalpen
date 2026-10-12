import { Text } from "@astryxdesign/core/Text";
import type { TermExplanation } from "../../api/types";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { SourceLink } from "../ui/source/SourceLink";
import { termPreview } from "./checklistModel";
import { SectionRow, SectionRows } from "./SectionRow";

/** The anchor of the terms section, for the outline. */
export const TERMS_ID = "ord-och-begrepp";
export const TERMS_TITLE = "Ord och begrepp";

/**
 * The words the document uses, explained (closed from the start, its first terms under the heading). The same words
 * can be pressed wherever they appear in the checklist's text.
 */
export function Terms({
  terms,
  noticeId,
  documentId,
}: {
  terms: readonly TermExplanation[];
  noticeId: string;
  documentId?: string;
}) {
  if (terms.length === 0) return null;
  return (
    <CollapsibleSection
      id={TERMS_ID}
      title={TERMS_TITLE}
      count={terms.length}
      countNoun={["ord", "ord"]}
      helper={termPreview(terms)}
      value={TERMS_ID}
    >
      <SectionRows>
        {terms.map((term) => (
          <SectionRow
            key={term.term}
            label={<Text weight="semibold">{term.term}</Text>}
            description={term.explanation}
            source={
              term.citation ? (
                <SourceLink
                  noticeId={noticeId}
                  citation={term.citation}
                  claim={term.term}
                  origin={TERMS_TITLE}
                  documentId={documentId}
                />
              ) : undefined
            }
          />
        ))}
      </SectionRows>
    </CollapsibleSection>
  );
}
