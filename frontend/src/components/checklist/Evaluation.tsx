import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { EvaluationCriterion, TermExplanation } from "../../api/types";
import { TermText } from "../TermText";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { SourceLink } from "../ui/source/SourceLink";
import { criterionDetail, criterionHeading, evaluationShares } from "./checklistModel";
import styles from "./Evaluation.module.css";

/** The anchor of the evaluation section, for the statistic tile and the outline. */
export const EVALUATION_ID = "utvardering";
export const EVALUATION_TITLE = "Så utvärderas anbuden";

/**
 * How the tenders are compared: a bar split by the weights when they make up a whole (two criteria, such as pris 70 %
 * and kvalitet 30 %), then each criterion with what the document says about it and its source. Closed from the start,
 * with the criteria under the heading ("Pris 70 % · Kvalitet 30 %").
 */
export function Evaluation({
  evaluation,
  noticeId,
  documentId,
  terms,
  defaultOpen = false,
}: {
  evaluation: readonly EvaluationCriterion[];
  noticeId: string;
  documentId?: string;
  terms?: readonly TermExplanation[];
  defaultOpen?: boolean;
}) {
  if (evaluation.length === 0) return null;
  const shares = evaluationShares(evaluation);
  const split = shares?.length === 2 ? shares : null;
  return (
    <CollapsibleSection
      id={EVALUATION_ID}
      title={EVALUATION_TITLE}
      helper={evaluation.map(criterionHeading).join(" · ")}
      defaultOpen={defaultOpen}
      isFlush={false}
      value={EVALUATION_ID}
    >
      <VStack gap={4}>
        {split && <meter className={styles.split} min={0} max={100} value={split[0]!.weight} aria-hidden="true" />}
        <VStack as="ul" role="list" aria-label="Utvärderingskriterier" gap={3}>
          {evaluation.map((criterion, index) => {
            const heading = criterionHeading(criterion);
            const detail = criterionDetail(criterion);
            return (
              <VStack as="li" key={`${criterion.name}-${index}`} gap={1}>
                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <HStack gap={2} vAlign="center">
                    {split && (
                      <span aria-hidden="true" className={index === 0 ? styles.swatch : `${styles.swatch} ${styles.swatchSecond}`} />
                    )}
                    <Text weight="semibold">{heading}</Text>
                  </HStack>
                  <SourceLink
                    noticeId={noticeId}
                    citation={criterion.citation}
                    claim={heading}
                    origin={EVALUATION_TITLE}
                    documentId={documentId}
                  />
                </HStack>
                {detail && <TermText text={detail} terms={terms} />}
              </VStack>
            );
          })}
        </VStack>
      </VStack>
    </CollapsibleSection>
  );
}
