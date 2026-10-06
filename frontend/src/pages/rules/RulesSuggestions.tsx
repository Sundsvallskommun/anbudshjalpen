import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { useId } from "react";
import { EXAMPLE_QUESTIONS } from "./rulesAnswer";

export interface RulesSuggestionsProps {
  /** The questions already asked in this conversation, which are not offered again. */
  asked: readonly string[];
  onAsk: (question: string) => void;
}

/**
 * Questions to ask with one press, above the writing field. They stay after an answer (direction.md, section 4
 * "Regelhjälpen"), titled "Fler frågor du kan ställa" once there is a conversation; as in the Fråga step, one that
 * has been asked is not offered again.
 */
export function RulesSuggestions({ asked, onAsk }: RulesSuggestionsProps) {
  const headingId = useId();
  const left = EXAMPLE_QUESTIONS.filter((question) => !asked.includes(question));
  if (left.length === 0) return null;
  return (
    <VStack gap={2}>
      <Heading level={5} accessibilityLevel={2} color="secondary" id={headingId}>
        {asked.length > 0 ? "Fler frågor du kan ställa" : "Exempel på frågor"}
      </Heading>
      <HStack as="ul" role="list" gap={2} wrap="wrap" aria-labelledby={headingId}>
        {left.map((question) => (
          <li key={question}>
            <Button label={question} size="sm" variant="secondary" onClick={() => onAsk(question)} />
          </li>
        ))}
      </HStack>
    </VStack>
  );
}
