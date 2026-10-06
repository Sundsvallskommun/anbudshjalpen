import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import type { VerificationSummary } from "../../api/types";
import { formatShortDate } from "../../lib/format";
import { engineDescription, verificationText, type ProvenanceBasis } from "../../lib/labels";
import { useIsPhone } from "../../lib/usePhone";

export type { ProvenanceBasis } from "../../lib/labels";

export interface AiProvenanceProps {
  /** The engine that produced the content ("heuristic", "eneo", "openai"); named once, in the popover. */
  engine: string;
  /**
   * What the content rests on: the procurement documents (default; checklists, answers, fit and draft reviews) or the
   * law (Regelhjälpen's LOU paragraphs). The popover then says how the sources are shown and what always applies:
   * "Det är alltid förfrågningsunderlaget som gäller" or "Det är alltid lagtexten som gäller".
   */
  basis?: ProvenanceBasis;
  /**
   * When inköp reviewed the content (a published checklist's `published_at`); leave out for content nobody
   * reviewed (answers, fit assessments, draft reviews): "Automatiskt framtaget · inte granskat av inköp".
   */
  reviewedAt?: string | null;
  /** Who reviewed, as the line says it: "Granskad av inköp" (default) or "Granskad och publicerad av inköp, Sundsvalls kommun". */
  reviewedLabel?: string;
  /** The citation check for the content: "Alla 86 källhänvisningar hittades i underlaget". */
  verification?: VerificationSummary;
  /** The words of the popover's trigger: "Hur togs det här fram?" (default) or "Hur togs listan fram?". */
  howLabel?: string;
  /** More to say in the popover, such as what a fit assessment compares. */
  details?: ReactNode;
}

/** A middle dot that keeps to the word before it (a no-break space), so a wrapped line never starts with "·". */
const SEPARATOR = "\u00a0·";

interface BasisCopy {
  /** How every claim points to its source. */
  sources: string;
  /** What the reader should do when inköp has not reviewed the content. */
  unreviewed: string;
  /** What always applies, last in the popover. */
  rule: string;
}

const BASIS_COPY: Record<ProvenanceBasis, BasisCopy> = {
  document: {
    sources:
      "Varje uppgift har en källhänvisning till underlaget. Anbudsklar kontrollerar själv att citatet står på den sida som anges; AI:n kan inte påverka kontrollen.",
    unreviewed: "Inköp har inte granskat det här. Kontrollera alltid mot underlaget.",
    rule: "Det är alltid förfrågningsunderlaget som gäller.",
  },
  law: {
    sources:
      "Varje paragraf som svaret bygger på visas med lagens egna ord, ur Anbudsklars egen kopia av LOU, med en länk till hela paragrafen.",
    unreviewed: "Inköp har inte granskat det här. Läs alltid hela paragrafen.",
    rule: "Det är alltid lagtexten som gäller.",
  },
};

function HowItWasMade({
  engine,
  basis,
  reviewedAt,
  verification,
  details,
}: Pick<AiProvenanceProps, "engine" | "reviewedAt" | "verification" | "details"> & { basis: ProvenanceBasis }) {
  const copy = BASIS_COPY[basis];
  const checked = verification ? verificationText(verification) : null;
  return (
    <VStack gap={2} padding={3}>
      <Text weight="semibold">Så togs det här fram</Text>
      <Text as="p">{engineDescription(engine, basis)}</Text>
      <Text as="p">
        {copy.sources}
        {checked ? ` ${checked}.` : ""}
      </Text>
      {details}
      <Text as="p">
        {reviewedAt
          ? `Inköp granskade innehållet ${formatShortDate(reviewedAt, "always")} innan det visades för företag.`
          : copy.unreviewed}
      </Text>
      <Text type="supporting">{copy.rule}</Text>
    </VStack>
  );
}

/**
 * The provenance line at the top of every automatic block (direction.md, section 2): read before the content, once.
 * Reviewed: "Granskad av inköp 5 okt 2026 · Alla 86 källhänvisningar hittades i underlaget · Hur togs det här fram?".
 * Not reviewed: "Automatiskt framtaget · inte granskat av inköp · Hur togs det här fram?". The popover names the
 * engine (regelbaserat or AI via Eneo) and explains the sources for what the content rests on: the procurement
 * documents, or the law for Regelhjälpen. On a phone the line is shorter and the trigger says "Mer".
 */
export function AiProvenance({
  engine,
  basis = "document",
  reviewedAt,
  reviewedLabel = "Granskad av inköp",
  verification,
  howLabel = "Hur togs det här fram?",
  details,
}: AiProvenanceProps) {
  const isPhone = useIsPhone();
  const checked = verification ? verificationText(verification) : null;
  const lead = reviewedAt
    ? `${reviewedLabel} ${formatShortDate(reviewedAt, isPhone ? "auto" : "always")}`
    : "Automatiskt framtaget";
  const rest = reviewedAt ? checked : "inte granskat av inköp";

  return (
    <HStack gap={2} vAlign="start">
      <Icon icon={reviewedAt ? "success" : "info"} color={reviewedAt ? "success" : "secondary"} size="sm" />
      {/* Running text, so the line wraps like a sentence and never starts with a dot. */}
      <Text as="div" type="supporting">
        <Text type="supporting" color="primary" weight={reviewedAt ? "semibold" : undefined}>
          {lead}
        </Text>
        {`${SEPARATOR} `}
        {rest && <Text type="supporting">{`${rest.replaceAll(" · ", `${SEPARATOR} `)}${SEPARATOR}`}</Text>}
        {rest && " "}
        <Popover
          label={howLabel}
          width={360}
          content={
            <HowItWasMade engine={engine} basis={basis} reviewedAt={reviewedAt} verification={verification} details={details} />
          }
        >
          <Link size="sm" hasUnderline label={isPhone ? `Mer: ${howLabel}` : undefined}>
            {isPhone ? "Mer" : howLabel}
          </Link>
        </Popover>
      </Text>
    </HStack>
  );
}
