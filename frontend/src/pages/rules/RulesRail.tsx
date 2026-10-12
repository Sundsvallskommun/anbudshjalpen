import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * The rail beside the conversation: where a question about one procurement belongs. Equal treatment: an unclear
 * procurement document is asked about in e-Avrop, so every supplier gets the same answer. Where the law text comes
 * from is told once per answer, in its provenance line.
 */
export function RulesRail() {
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={3} accessibilityLevel={2}>
          Bra att veta
        </Heading>
        <Text as="p">
          Gäller frågan en viss upphandling? Öppna den bland <Link href="/upphandlingar">upphandlingarna</Link> och tryck
          på Fråga AI där. Då svarar Anbudsklar utifrån just det underlaget.
        </Text>
        <Text as="p">
          Är något oklart i ett förfrågningsunderlag? Ställ frågan i e-Avrop före sista dag för frågor, så får alla
          leverantörer samma svar.
        </Text>
      </VStack>
    </Card>
  );
}
