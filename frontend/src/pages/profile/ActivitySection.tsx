import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Typeahead, type SearchableItem, type SearchSource } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, type Ref } from "react";
import { searchCpv, useSuggestCpv } from "../../api/queries";
import type { CpvSuggestion } from "../../api/types";
import { ErrorNotice } from "../../components/states";
import { useIsPhone } from "../../lib/usePhone";
import { ChosenCodes } from "./ChosenCodes";
import { CpvSuggestions } from "./CpvSuggestions";
import { cpvChip, LIMITS } from "./profileDraft";

/** The CPV search behind the field: the name first, so no code is ever shown bare. */
const cpvSource: SearchSource<SearchableItem> = {
  search: async (query) => {
    try {
      return (await searchCpv(query)).map((hit) => cpvChip(hit.code, hit.label));
    } catch {
      return [];
    }
  },
  bootstrap: () => [],
};

export interface ActivitySectionProps {
  /** The company in its own words, which the CPV suggestions and the matching read. */
  description: string;
  onDescriptionChange: (value: string) => void;
  /** Why the description cannot be used as it is: too long to save, or too short to suggest codes from. */
  descriptionError: string | null;
  descriptionRef: Ref<HTMLTextAreaElement>;
  /** The chosen CPV codes, named first ("Målning · 45442100"). */
  codes: SearchableItem[];
  onCodesChange: (items: SearchableItem[]) => void;
  /** Every CPV division by code, for grouping the chosen codes. */
  divisions: Record<string, string>;
  /** The description is too short to suggest from: the form points there. */
  onDescriptionNeeded: () => void;
}

/**
 * "Vad ni gör (CPV-koder)" (direction.md, section 4 "Företagsprofil"): the company in its own words, and the CPV
 * codes it works in: a search field adds one at a time, and the chosen ones stand as rows grouped by area, which
 * stays readable at twenty codes where chips did not. "Föreslå koder" reads the description, so the two share one
 * card. A phone gives the description more rows, so it shows without scrolling.
 */
export function ActivitySection({
  description,
  onDescriptionChange,
  descriptionError,
  descriptionRef,
  codes,
  onCodesChange,
  divisions,
  onDescriptionNeeded,
}: ActivitySectionProps) {
  const suggest = useSuggestCpv();
  const headingId = useId();
  const isPhone = useIsPhone();
  const chosen = new Set(codes.map((item) => item.id));

  const askForSuggestions = () => {
    const text = description.trim();
    if (text.length < LIMITS.suggestFrom) {
      onDescriptionNeeded();
      return;
    }
    suggest.mutate(text);
  };

  const isFull = codes.length >= LIMITS.cpv;
  const addCode = (item: SearchableItem | null) => {
    if (!item || chosen.has(item.id) || isFull) return;
    onCodesChange([...codes, item]);
  };

  const applySuggestions = (added: readonly CpvSuggestion[], removed: readonly string[]) => {
    const kept = codes.filter((item) => !removed.includes(item.id));
    const room = Math.max(0, LIMITS.cpv - kept.length);
    onCodesChange([...kept, ...added.slice(0, room).map((suggestion) => cpvChip(suggestion.code, suggestion.label))]);
  };

  return (
    <Card>
      <VStack as="section" gap={5} aria-labelledby={headingId}>
        <Heading level={3} accessibilityLevel={2} id={headingId}>
          Vad ni gör (CPV-koder)
        </Heading>
        <TextArea
          ref={descriptionRef}
          label="Beskriv företaget"
          description="Med egna ord: vilka tjänster ni erbjuder, var ni arbetar och hur stora uppdrag ni tar."
          value={description}
          onChange={onDescriptionChange}
          rows={isPhone ? 8 : 5}
          maxLength={LIMITS.description}
          status={descriptionError ? { type: "error", message: descriptionError } : undefined}
        />
        <VStack gap={3}>
          <Typeahead
            label="Lägg till kod"
            description={
              isFull
                ? `Profilen har det högsta antalet koder, ${LIMITS.cpv}. Ta bort en för att lägga till en annan.`
                : "EU:s kodlista för vad som upphandlas. Ni behöver inte kunna koderna – tryck Föreslå koder."
            }
            placeholder="Sök, till exempel målning eller 45442"
            searchSource={cpvSource}
            value={null}
            onChange={addCode}
            minQueryLength={2}
            debounceMs={250}
            emptySearchResultsText="Inga koder hittades"
          />
          <ChosenCodes
            codes={codes}
            divisions={divisions}
            onRemove={(code) => onCodesChange(codes.filter((item) => item.id !== code))}
          />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button label="Föreslå koder" isLoading={suggest.isPending} onClick={askForSuggestions} />
            <Text type="supporting">Förslagen bygger på beskrivningen ovan.</Text>
          </HStack>
        </VStack>
        {suggest.isError && <ErrorNotice title="Inga förslag kunde tas fram" error={suggest.error} />}
        {suggest.isSuccess && (
          <CpvSuggestions
            suggestions={suggest.data.suggestions.suggestions}
            engine={suggest.data.engine}
            chosen={chosen}
            onChange={applySuggestions}
          />
        )}
      </VStack>
    </Card>
  );
}
