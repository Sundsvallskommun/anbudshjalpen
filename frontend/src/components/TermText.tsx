import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { TermExplanation } from "../api/types";
import { splitByTerms } from "../lib/terms";
import styles from "./TermText.module.css";

function TermButton({ text, explanation }: { text: string; explanation: TermExplanation }) {
  return (
    <Popover
      label={`Förklaring av ${explanation.term}`}
      width={320}
      content={
        <VStack gap={1} padding={3}>
          <Text weight="semibold">{explanation.term}</Text>
          <Text>{explanation.explanation}</Text>
        </VStack>
      }
    >
      <button type="button" className={styles.term}>
        {text}
      </button>
    </Popover>
  );
}

/**
 * Text in which the checklist's explained terms can be pressed for their explanation ("termerna förklaras
 * vid klick"). The container is a <div>, not a <p>: the popover wraps its trigger and surface in <div>s,
 * which a paragraph may not contain.
 */
export function TermText({ text, terms }: { text: string; terms: readonly TermExplanation[] }) {
  const byTerm = new Map(terms.map((term) => [term.term.trim(), term]));
  return (
    <Text as="div" display="block">
      {splitByTerms(text, [...byTerm.keys()]).map((segment, index) => {
        const explanation = segment.term ? byTerm.get(segment.term) : undefined;
        return explanation ? <TermButton key={index} text={segment.text} explanation={explanation} /> : segment.text;
      })}
    </Text>
  );
}
