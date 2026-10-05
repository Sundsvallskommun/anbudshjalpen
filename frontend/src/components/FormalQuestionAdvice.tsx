import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { IsoDateTime } from "../api/types";
import { formatCalendarDate, relativeCalendarDeadline, swedishDate, swedishToday } from "../lib/format";
import type { LabelledLink } from "../lib/links";
import { ReminderAction } from "./ReminderAction";

/**
 * When the document does not settle a question: ask it formally in e-Avrop before the question deadline.
 * The buyer must treat all suppliers alike, so only an answer published to everyone counts. Anbudsklar
 * never gives one supplier advice the others do not get.
 *
 * `questionDeadline` is the published checklist's frågestopp. It is a date, sent as the end of that day
 * (23:59:59) in Swedish time, so it is shown as a date. The reminder is offered only when it is known:
 * without it the backend has nothing to remind about.
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
  const deadline = questionDeadline ? swedishDate(questionDeadline) : null;
  const reminderDeadline = deadline && deadline >= swedishToday() ? deadline : null;
  return (
    <Banner status="info" title="Ställ frågan formellt i e-Avrop" collapsible={false}>
      <VStack gap={3}>
        <Text as="p">
          Kommunen måste behandla alla leverantörer lika. Ett svar som bara du får kan därför inte ändra vad som
          gäller i upphandlingen. Ställ frågan i upphandlingens frågefunktion i e-Avrop, så får alla som vill
          lämna anbud samma svar.
        </Text>
        <Text as="p">
          {deadline ? (
            <>
              Sista dag för frågor: <Text weight="semibold">{formatCalendarDate(deadline)}</Text> (
              {relativeCalendarDeadline(deadline)}).
            </>
          ) : (
            "Sista dag för frågor står i underlaget, oftast i de administrativa föreskrifterna."
          )}
        </Text>
        {isFictitiousWithoutPage && (
          <Text as="p">
            Den här upphandlingen är påhittad för demon och finns därför inte i e-Avrop. I en riktig upphandling
            ställer du frågan där.
          </Text>
        )}
        {(link || reminderDeadline) && (
          <HStack gap={4} vAlign="center" wrap="wrap">
            {link && (
              <Link href={link.href} isExternalLink isStandalone>
                {link.text}
              </Link>
            )}
            {reminderDeadline && (
              <ReminderAction noticeId={noticeId} kind="fragestopp" deadline={reminderDeadline} subject="frågestoppet" />
            )}
          </HStack>
        )}
        <Text type="supporting">Källa: LOU 4 kap. 1 § (likabehandling), 12 kap. 11 § och 19 kap. 13 §.</Text>
      </VStack>
    </Banner>
  );
}
