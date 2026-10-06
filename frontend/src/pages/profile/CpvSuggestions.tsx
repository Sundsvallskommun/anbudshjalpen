import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { CpvSuggestion } from "../../api/types";
import { formatNumber } from "../../lib/format";
import { cpvChipLabel, LIMITS } from "./profileDraft";

/** Who made the suggestions, said once above them (direction.md, principle 5); no reviewer ever sees them. */
const MADE_BY: Record<string, string> = {
  heuristic: "Framtagna automatiskt utifrån orden i beskrivningen och inte granskade.",
  eneo: "Framtagna med AI via Eneo utifrån beskrivningen och inte granskade.",
};
const MADE_BY_MODEL = "Framtagna med AI utifrån beskrivningen och inte granskade.";

export interface CpvSuggestionsProps {
  suggestions: readonly CpvSuggestion[];
  /** The engine that made them ("heuristic", "eneo", "openai"). */
  engine: string;
  /** The codes in the profile now. */
  chosen: ReadonlySet<string>;
  /** The codes to add and to take away, from one change of the boxes. */
  onChange: (added: readonly CpvSuggestion[], removed: readonly string[]) => void;
}

/**
 * The suggested codes as boxes to tick, each named first ("Målning · 45442100") with why it was suggested below it,
 * so the reason is there on a touch screen too. A ticked box is a code in the profile; the field above shows the
 * same codes as chips.
 */
export function CpvSuggestions({ suggestions, engine, chosen, onChange }: CpvSuggestionsProps) {
  if (suggestions.length === 0) {
    return <Text color="secondary">Inga förslag hittades. Beskriv gärna verksamheten mer utförligt.</Text>;
  }
  const isFull = chosen.size >= LIMITS.cpv;
  const ticked = suggestions.filter((suggestion) => chosen.has(suggestion.code)).map((suggestion) => suggestion.code);

  const change = (values: string[]) => {
    const next = new Set(values);
    const added = suggestions.filter((suggestion) => next.has(suggestion.code) && !chosen.has(suggestion.code));
    const removed = ticked.filter((code) => !next.has(code));
    onChange(added, removed);
  };

  return (
    <VStack gap={2}>
      <CheckboxList
        label="Förslag utifrån beskrivningen"
        description={`${MADE_BY[engine] ?? MADE_BY_MODEL} Välj de som stämmer.`}
        value={ticked}
        onChange={change}
        hasDividers
      >
        {/* Label and reason are passed as nodes: Astryx cuts a plain string to one line, and a long name or its code
            must not be cut off on a phone. The box is still named by its visible label. */}
        {suggestions.map((suggestion) => (
          <CheckboxListItem
            key={suggestion.code}
            value={suggestion.code}
            label={<>{cpvChipLabel(suggestion.code, suggestion.label)}</>}
            description={suggestion.reason ? <>{suggestion.reason}</> : undefined}
            isDisabled={isFull && !chosen.has(suggestion.code)}
          />
        ))}
      </CheckboxList>
      {isFull && (
        <Text type="supporting">{`Profilen har det högsta antalet koder, ${formatNumber(LIMITS.cpv)}. Ta bort en för att lägga till en annan.`}</Text>
      )}
    </VStack>
  );
}
