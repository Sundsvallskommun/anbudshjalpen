import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { RuleSource } from "../../api/types";
import { useIsPhone } from "../../lib/usePhone";
import { sourceLinkLabel, sourceTitle } from "./rulesAnswer";

/**
 * One source an answer rests on, as a muted card inside the answer (direction.md, section 4 "Regelhjälpen"):
 * "LOU 20 kap. 1 § · Avtalsspärr", the start of the text cut at a whole sentence, and "Läs hela paragrafen ↗". A
 * section of one of the municipality's steering documents (decision 0022) has the same shape, "Inköpsstrategin
 * 5.2 · Hållbara inköp", with the backend's note under the title ("Kommunens styrdokument, fastställt av
 * kommunfullmäktige 2023-09-25.") so that nobody reads it as law, and "Läs hela avsnittet ↗". The excerpt comes
 * from Anbudshjälpen's own copy of the source, never from a model. The link's name ends with the reference, so
 * every link on the page says where it goes (WCAG 2.4.4). On a phone the card sits closer to its edge, since it is
 * inside the answer's card and the quote is indented again.
 */
export function RuleSourceCard({ source }: { source: RuleSource }) {
  const isPhone = useIsPhone();
  const target = source.reference ?? source.title;
  return (
    <Card variant="muted" padding={isPhone ? 3 : 4}>
      <VStack gap={2} hAlign="start">
        <Heading level={4} accessibilityLevel={4}>
          {sourceTitle(source)}
        </Heading>
        {source.note && (
          <Text type="supporting" color="secondary">
            {source.note}
          </Text>
        )}
        {source.excerpt && <Blockquote>{source.excerpt}</Blockquote>}
        {source.url && (
          <Link href={source.url} isExternalLink isStandalone>
            {sourceLinkLabel(source)} <VisuallyHidden>{target}</VisuallyHidden>
          </Link>
        )}
      </VStack>
    </Card>
  );
}
