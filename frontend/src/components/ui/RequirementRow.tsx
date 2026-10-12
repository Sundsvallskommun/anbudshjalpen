import { HStack } from "@astryxdesign/core/HStack";
import { Item } from "@astryxdesign/core/Item";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import type { Requirement, TermExplanation } from "../../api/types";
import { keepNumbersTogether, splitTitleAndBody } from "../../lib/text";
import { TermText } from "../TermText";
import styles from "./RequirementRow.module.css";
import { SourceLink } from "./source/SourceLink";

/** The anchor of a requirement's row, for fit reasons and review rows to link to: "krav-K12". */
export function requirementAnchor(requirementId: string): string {
  return `krav-${requirementId}`;
}

/** Evidence short enough for a chip; longer evidence is a line of text, since a chip cuts its label off. */
const CHIP_MAX = 40;

function Evidence({ evidence }: { evidence: string }) {
  const text = evidence.trim().replace(/\.$/u, "");
  if (text.length <= CHIP_MAX) return <Token label={`Bevis: ${text}`} size="sm" />;
  return <Text type="supporting">{`Bevis: ${text}.`}</Text>;
}

export interface RequirementRowProps {
  requirement: Requirement;
  noticeId: string;
  /** The checklist's document; the notice's primary document when left out. */
  documentId?: string;
  /** The group the row is in ("Skallkrav"), as the source dialog says where the claim was shown. */
  origin?: string;
  /** The checklist's explained terms, pressable in the body text. */
  terms?: readonly TermExplanation[];
  /** Controls of the row's own, such as the buyer's "Ändra" (before the source link). */
  actions?: ReactNode;
  /** Render as a list item inside a list (default) or as a plain block. */
  as?: "li" | "div";
  /** Rows edge to edge in a section card get the card's inset and a divider between them (default). */
  isInset?: boolean;
}

/**
 * One requirement as a compact row (at least 48 px): the title, an optional "Bevis: …" chip, the body and under it
 * "Källa: 6.1 Upphandlingsföreskrifter.pdf, s. 5".
 * Nothing is said twice (direction.md, section 9.4): a body that repeats the title is left out, one that continues it
 * shows only the continuation, and a title cut off with "…" gives way to the whole sentence. The row carries its
 * anchor (#krav-K12) so other rows can link to it.
 */
export function RequirementRow({
  requirement,
  noticeId,
  documentId,
  origin,
  terms,
  actions,
  as = "li",
  isInset = true,
}: RequirementRowProps) {
  const shown = splitTitleAndBody(requirement.title, requirement.plain_language);
  return (
    <Item
      as={as}
      id={requirementAnchor(requirement.id)}
      align="start"
      className={isInset ? styles.inset : undefined}
      label={
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text>{keepNumbersTogether(shown.title)}</Text>
          {requirement.evidence && <Evidence evidence={requirement.evidence} />}
        </HStack>
      }
      description={
        <VStack gap={1}>
          {shown.body && <TermText text={keepNumbersTogether(shown.body)} terms={terms} />}
          <Text type="supporting">
            Källa:{" "}
            <SourceLink
              noticeId={noticeId}
              citation={requirement.citation}
              claim={requirement.title}
              origin={origin}
              documentId={documentId}
            />
          </Text>
        </VStack>
      }
      endContent={actions}
    />
  );
}
