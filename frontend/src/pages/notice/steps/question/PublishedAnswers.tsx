import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { NoticeDetail, PublishedAnswerView } from "../../../../api/types";
import { CollapsibleSection } from "../../../../components/ui/CollapsibleSection";
import { calendarDateOf, formatShortDate } from "../../../../lib/format";

/** The section's anchor, so a link can open it ("#publicerade-svar"). */
export const PUBLISHED_ANSWERS_ID = "publicerade-svar";

/**
 * Paragraphs of a question or an answer as e-Avrop's log gives it: a blank line separates paragraphs, and a single
 * line break inside one is just where the writer pressed Enter.
 */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/gu, " ").trim())
    .filter(Boolean);
}

function Entry({ entry, number }: { entry: PublishedAnswerView; number: number }) {
  const answered = formatShortDate(calendarDateOf(entry.answered_at));
  return (
    <VStack as="li" gap={2}>
      <Text type="supporting">{`Fråga ${number} · besvarad ${answered}`}</Text>
      <VStack gap={1}>
        {paragraphsOf(entry.question).map((paragraph, index) => (
          <Text as="p" weight="semibold" key={index}>
            {paragraph}
          </Text>
        ))}
      </VStack>
      <VStack gap={1}>
        {paragraphsOf(entry.answer).map((paragraph, index) => (
          <Text as="p" key={index}>
            {paragraph}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}

/**
 * The buyer's published answers to other suppliers' questions (decision 0013), before the reader's own thread: a
 * group with its count in the heading, open from the start because an answer can change what the document says.
 * Nothing is rendered when the notice has none, which is most notices.
 */
export function PublishedAnswers({ notice }: { notice: NoticeDetail }) {
  const answers = notice.published_answers;
  if (answers.length === 0) return null;
  return (
    <CollapsibleSection
      id={PUBLISHED_ANSWERS_ID}
      title="Svar inköp har publicerat i e-Avrop"
      count={answers.length}
      countNoun={["svar", "svar"]}
      helper="Frågor som leverantörer har ställt och kommunens svar. Svaren hör till underlaget och är samma för alla."
      defaultOpen
      isFlush={false}
      headingLevel={3}
    >
      <VStack as="ol" role="list" aria-label="Publicerade frågor och svar" gap={5}>
        {answers.map((entry, index) => (
          <Entry key={`${entry.answered_at}-${index}`} entry={entry} number={index + 1} />
        ))}
      </VStack>
    </CollapsibleSection>
  );
}
