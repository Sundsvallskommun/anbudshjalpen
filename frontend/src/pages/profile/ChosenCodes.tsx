import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import type { SearchableItem } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { useId } from "react";
import { cpvDivision, splitCpvChip } from "./profileDraft";

export interface ChosenCodesProps {
  /** The chosen codes, as the draft holds them ("Målning · 45442100"). */
  codes: readonly SearchableItem[];
  /** Every CPV division by code, for the group headings. */
  divisions: Record<string, string>;
  onRemove: (code: string) => void;
}

interface Group {
  division: string;
  title: string;
  items: { code: string; label: string }[];
}

/** The codes grouped by CPV division, divisions and codes in code order, so related work sits together. */
export function groupByDivision(codes: readonly SearchableItem[], divisions: Record<string, string>): Group[] {
  const groups = new Map<string, Group>();
  for (const item of [...codes].sort((a, b) => a.id.localeCompare(b.id))) {
    const division = cpvDivision(item.id);
    const group = groups.get(division) ?? {
      division,
      title: divisions[division] ?? `Område ${division.slice(0, 2)}`,
      items: [],
    };
    group.items.push(splitCpvChip(item));
    groups.set(division, group);
  }
  return [...groups.values()];
}

/**
 * The chosen codes as rows under their CPV division (direction.md, principle "dense data = rows"), each named
 * first with the code after it in a quieter colour, the way the search field and the suggestions name a code, and
 * a quiet "Ta bort" at the end. Chips in the search field lost their shape past a handful of codes; rows grouped
 * by area stay readable at twenty.
 */
export function ChosenCodes({ codes, divisions, onRemove }: ChosenCodesProps) {
  const headingId = useId();
  if (codes.length === 0) {
    return <Text color="secondary">Inga koder valda ännu. Sök ovan eller tryck Föreslå koder.</Text>;
  }
  return (
    <VStack gap={5} role="group" aria-labelledby={headingId}>
      <Text id={headingId} weight="semibold">
        {`Era koder · ${codes.length}`}
      </Text>
      {groupByDivision(codes, divisions).map((group) => (
        <VStack key={group.division} gap={2}>
          <Heading level={5} accessibilityLevel={3} color="secondary">
            {group.title}
          </Heading>
          <List density="compact" hasDividers>
            {group.items.map((item) => (
              <ListItem
                key={item.code}
                // A node, not a string: Astryx cuts a string label to one line, and a long name ("Delar av eller
                // kompletta bygg- och anläggningsarbeten…") must wrap, on a phone above all.
                label={
                  <>
                    <Text>{item.label}</Text>
                    {/* A no-break space keeps the dot with the last word, so no line starts with "· 45200000". */}
                    <Text color="secondary" hasTabularNumbers textWrap="nowrap">
                      {`\u00a0· ${item.code}`}
                    </Text>
                  </>
                }
                endContent={
                  // The visible word is the children; `label` is the accessible name, which says which code goes.
                  <Button
                    label={`Ta bort ${item.label} · ${item.code}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(item.code)}
                  >
                    Ta bort
                  </Button>
                }
              />
            ))}
          </List>
        </VStack>
      ))}
    </VStack>
  );
}
