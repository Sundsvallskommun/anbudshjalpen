import { Popover } from "@astryxdesign/core/Popover";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { TermExplanation } from "../api/types";
import { findGlossaryEntry, glossaryTerms } from "../lib/glossary";
import { splitByTerms } from "../lib/terms";
import styles from "./TermText.module.css";

interface Explained {
  /** The heading in the popover: the checklist's term, or the glossary's word for any of its forms. */
  term: string;
  explanation: string;
}

function TermButton({ text, explained }: { text: string; explained: Explained }) {
  return (
    <Popover
      label={`Förklaring av ${explained.term}`}
      width={320}
      content={
        <VStack gap={1} padding={3}>
          <Text weight="semibold">{explained.term}</Text>
          <Text>{explained.explanation}</Text>
        </VStack>
      }
    >
      <button type="button" className={styles.term}>
        {text}
      </button>
    </Popover>
  );
}

const GLOSSARY_TERMS = glossaryTerms();

/**
 * The explanations for a text: the checklist's own terms (from the document) first, then the glossary's, which
 * never replace a term the document explains.
 */
function explanations(terms: readonly TermExplanation[], withGlossary: boolean): Map<string, Explained> {
  const byTerm = new Map<string, Explained>();
  for (const term of terms) {
    const key = term.term.trim();
    if (key) byTerm.set(key, { term: key, explanation: term.explanation });
  }
  if (!withGlossary) return byTerm;
  const documented = new Set([...byTerm.keys()].map((key) => key.toLocaleLowerCase("sv")));
  for (const term of GLOSSARY_TERMS) {
    const entry = findGlossaryEntry(term.term);
    const covered = entry?.forms.some((form) => documented.has(form.toLocaleLowerCase("sv")));
    if (!covered && !byTerm.has(term.term)) {
      byTerm.set(term.term, { term: entry?.term ?? term.term, explanation: term.explanation });
    }
  }
  return byTerm;
}

/**
 * Text in which explained terms can be pressed for their explanation ("fackord förklaras vid klick"): the
 * checklist's terms and, unless `withGlossary` is false, the procurement glossary. Each word is explained once per
 * text, whichever of its forms comes first. The container is a <div>, not a <p>: the popover wraps its trigger and
 * surface in <div>s, which a paragraph may not contain.
 */
export function TermText({
  text,
  terms = [],
  withGlossary = true,
}: {
  text: string;
  terms?: readonly TermExplanation[];
  withGlossary?: boolean;
}) {
  const byTerm = explanations(terms, withGlossary);
  const shown = new Set<string>();
  return (
    <Text as="div" display="block">
      {splitByTerms(text, [...byTerm.keys()]).map((segment, index) => {
        const explained = segment.term ? byTerm.get(segment.term) : undefined;
        // One explanation per word: "skallkrav" and "skallkraven" share the glossary's heading.
        if (!explained || shown.has(explained.term)) return segment.text;
        shown.add(explained.term);
        return <TermButton key={index} text={segment.text} explained={explained} />;
      })}
    </Text>
  );
}
