import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { RuleSource } from "../../api/types";
import { useIsPhone } from "../../lib/usePhone";
import { isLawSource, sourceTitle } from "./rulesAnswer";

/**
 * One paragraph an answer rests on, as a muted card inside the answer (direction.md, section 4 "Regelhjälpen"):
 * "LOU 20 kap. 1 § · Avtalsspärr", the start of the law text cut at a whole sentence, and "Läs hela paragrafen ↗".
 * The excerpt comes from Anbudshjälpen's own copy of LOU, never from a model. The link's name ends with the reference,
 * so every link on the page says where it goes (WCAG 2.4.4). On a phone the card sits closer to its edge, since it
 * is inside the answer's card and the quote is indented again.
 */
export function RuleSourceCard({ source }: { source: RuleSource }) {
  const isPhone = useIsPhone();
  const isLaw = isLawSource(source);
  const target = source.reference ?? source.title;
  return (
    <Card variant="muted" padding={isPhone ? 3 : 4}>
      <VStack gap={2} hAlign="start">
        <Heading level={4} accessibilityLevel={4}>
          {sourceTitle(source)}
        </Heading>
        {source.excerpt && <Blockquote>{source.excerpt}</Blockquote>}
        {source.url && (
          <Link href={source.url} isExternalLink isStandalone>
            {isLaw ? "Läs hela paragrafen" : "Läs källan"} <VisuallyHidden>{target}</VisuallyHidden>
          </Link>
        )}
      </VStack>
    </Card>
  );
}
