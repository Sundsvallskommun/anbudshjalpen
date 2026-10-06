import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useId } from "react";
import { Row, RowList } from "../../components/RowList";
import { DeadlineBlock } from "../../components/ui/DeadlineBlock";
import { ReminderState } from "../../components/ui/ReminderState";
import { REMINDER_KIND } from "../../lib/labels";
import { DEADLINE_SUBJECT, type DeadlineSuggestion } from "./reminderFacts";

export interface ReminderSuggestionsProps {
  suggestions: readonly DeadlineSuggestion[];
  /** The page has no reminder yet: the suggestions are its empty state. */
  isEmpty: boolean;
}

/**
 * The nearest deadlines in the company's matches, each with "Påminn mig" (direction.md: "Det tomma läget föreslår de
 * närmaste fristerna från träffarna"). On an empty page they are the empty state itself, under "Inga påminnelser
 * ännu"; they stay while the user sets reminders from them. The rows are the same reminder control as beside every
 * deadline, so a row turns into "Påminnelse mejlas 7 nov" once it is set.
 */
export function ReminderSuggestions({ suggestions, isEmpty }: ReminderSuggestionsProps) {
  const headingId = useId();
  return (
    <VStack as="section" gap={3} aria-labelledby={headingId}>
      <VStack gap={1}>
        <Heading level={3} accessibilityLevel={2} id={headingId}>
          {isEmpty ? "Inga påminnelser ännu" : "Frister i dina träffar"}
        </Heading>
        <Text color="secondary">
          {isEmpty
            ? "Lägg till en påminnelse vid en frist, så får du ett mejl i god tid före den. Här är de närmaste fristerna i upphandlingar som verkar passa er."
            : "De närmaste fristerna i upphandlingar som verkar passa er."}
        </Text>
      </VStack>
      <Card padding={0}>
        <RowList label="Frister i dina träffar" isInset>
          {suggestions.map((suggestion) => (
            <Row key={`${suggestion.noticeId}-${suggestion.kind}`}>
              <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                <VStack gap={1}>
                  <Link href={`/upphandlingar/${suggestion.noticeId}`} weight="semibold">
                    {suggestion.title}
                  </Link>
                  <DeadlineBlock deadline={suggestion.deadline} label={REMINDER_KIND[suggestion.kind]} variant="inline" />
                </VStack>
                <ReminderState
                  noticeId={suggestion.noticeId}
                  kind={suggestion.kind}
                  deadline={suggestion.date}
                  subject={DEADLINE_SUBJECT[suggestion.kind]}
                />
              </HStack>
            </Row>
          ))}
        </RowList>
      </Card>
    </VStack>
  );
}
