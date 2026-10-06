import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { EXAMPLE_QUESTIONS, QUESTION_PARAM } from "../rules/rulesAnswer";
import { CardHeading } from "./CardHeading";
import { ForwardLink } from "./ForwardLink";

/** The question the card offers: Regelhjälpen's first example ("Hur lång är avtalsspärren?"). */
export const EXAMPLE_QUESTION = EXAMPLE_QUESTIONS[0] ?? "Hur lång är avtalsspärren?";

/** Regelhjälpen with a question asked on arrival: it answers at once and then drops the question from the address. */
export function rulesQuestionHref(question: string): string {
  return `/regelhjalpen?${QUESTION_PARAM}=${encodeURIComponent(question)}`;
}

/**
 * "Frågor om upphandling?": the way to Regelhjälpen from Start (direction.md, section 4 "Start"), with an example
 * question that opens Regelhjälpen with its answer.
 */
export function RulesCard() {
  return (
    <Card>
      <VStack as="section" aria-labelledby="regel-kort" gap={3}>
        <CardHeading id="regel-kort">Frågor om upphandling?</CardHeading>
        <Text as="p">Regelhjälpen svarar med hänvisning till LOU och Upphandlingsmyndighetens vägledningar.</Text>
        <HStack>
          <Button label={EXAMPLE_QUESTION} size="sm" href={rulesQuestionHref(EXAMPLE_QUESTION)} />
        </HStack>
        <ForwardLink href="/regelhjalpen">Öppna Regelhjälpen</ForwardLink>
      </VStack>
    </Card>
  );
}
