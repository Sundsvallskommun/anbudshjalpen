import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { IsoDateTime } from "../api/types";
import { calendarDateOf, formatLongDate, isPassed } from "../lib/format";
import type { LabelledLink } from "../lib/links";
import { ReminderState } from "./ui/ReminderState";

/** "Ställ frågan i e-Avrop senast 30 oktober – då får alla leverantörer samma svar." */
export function formalQuestionSentence(questionDeadline: IsoDateTime | null): string {
  if (!questionDeadline) {
    return "Ställ frågan i e-Avrop före sista dag för frågor – då får alla leverantörer samma svar. Datumet står i underlaget.";
  }
  const date = formatLongDate(calendarDateOf(questionDeadline), "auto");
  if (isPassed(questionDeadline)) return `Sista dag för frågor var ${date}. Det är underlaget som gäller.`;
  return `Ställ frågan i e-Avrop senast ${date} – då får alla leverantörer samma svar.`;
}

/**
 * When the document does not settle a question: ask it formally in e-Avrop before the question deadline (direction.md,
 * section 4 "Steg 2 Fråga"). The buyer must treat all suppliers alike, so only an answer published to everyone counts;
 * Anbudshjälpen never gives one supplier advice the others do not get. A muted box inset in the answer, with the
 * reminder and the way to e-Avrop on one line.
 *
 * `questionDeadline` is the published checklist's frågestopp, sent as the end of that day in Swedish time, so it is
 * shown as a date. The reminder is offered only while it is ahead: without it the backend has nothing to remind about.
 */
export function FormalQuestionAdvice({
  noticeId,
  questionDeadline,
  link,
  isFictitiousWithoutPage,
}: {
  noticeId: string;
  questionDeadline: IsoDateTime | null;
  link: LabelledLink | null;
  /** A made-up notice with no page of its own: say why it cannot be found in e-Avrop. */
  isFictitiousWithoutPage: boolean;
}) {
  const deadline = questionDeadline ? calendarDateOf(questionDeadline) : null;
  return (
    <Card variant="muted" padding={4}>
      <HStack gap={3} vAlign="start">
        <Icon icon="info" color="secondary" size="md" />
        <VStack gap={2} hAlign="start">
          <VStack gap={0.5}>
            <Text weight="semibold">Ger underlaget inget entydigt svar?</Text>
            <Text>{formalQuestionSentence(questionDeadline)}</Text>
          </VStack>
          <HStack gap={4} vAlign="center" wrap="wrap">
            {deadline && <ReminderState noticeId={noticeId} kind="fragestopp" deadline={deadline} subject="sista dag för frågor" />}
            {link && (
              <Link href={link.href} isExternalLink isStandalone>
                {link.text}
              </Link>
            )}
            {isFictitiousWithoutPage && <Text type="supporting">Den här upphandlingen är påhittad och finns inte i e-Avrop.</Text>}
          </HStack>
        </VStack>
      </HStack>
    </Card>
  );
}
