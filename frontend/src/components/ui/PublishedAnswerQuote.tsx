import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { AnswerCitation, PublishedAnswerView } from "../../api/types";
import { calendarDateOf, formatShortDate } from "../../lib/format";
import styles from "./PublishedAnswerQuote.module.css";

/** The section on a notice's page that lists inköp's answers ("#publicerade-svar"). */
export const PUBLISHED_ANSWERS_ID = "publicerade-svar";
export const PUBLISHED_ANSWERS_TITLE = "Frågor och svar från inköp";

/** The anchor of one entry, from its stable key: a quote of the answer links here (decision 0018). */
export function answerAnchor(key: string): string {
  return `svar-${key.slice(0, 12)}`;
}

/** An entry and its number on the page ("Fråga 3"), oldest first as the model numbers them; null when withdrawn. */
export function findPublishedAnswer(
  answers: readonly PublishedAnswerView[],
  key: string | null,
): { entry: PublishedAnswerView; number: number } | null {
  const index = key ? answers.findIndex((entry) => entry.key === key) : -1;
  const entry = answers[index];
  return entry ? { entry, number: index + 1 } : null;
}

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

/** "Fråga 3 · Besvarad 9 okt", the line above an entry and above a quote of it. */
export function answerMeta(number: number, entry: PublishedAnswerView): string {
  return `Fråga ${number} · Besvarad ${formatShortDate(calendarDateOf(entry.answered_at))}`;
}

/** The buyer's words on their own tinted surface with an accent edge, so they never read as part of the question. */
export function AnswerText({ text, label = "Svar från inköp" }: { text: string; label?: string }) {
  return (
    <VStack gap={1} className={styles.answer}>
      <Text type="label" color="accent">
        {label}
      </Text>
      {paragraphsOf(text).map((paragraph, index) => (
        <Text as="p" key={index} weight="medium">
          {paragraph}
        </Text>
      ))}
    </VStack>
  );
}

/**
 * A claim's source in inköp's published answers (decision 0018), where a document quote would have its page: the
 * question it answers, quiet, then the quoted answer on its surface, then a link to the entry on the notice's page. A
 * quote our check could not find among the answers, or whose answer e-Avrop has since withdrawn, says so, as a
 * document quote does, and the link looks like a document quote's source link.
 */
export function PublishedAnswerQuote({
  citation,
  answers,
  noticeId,
}: {
  citation: AnswerCitation;
  answers: readonly PublishedAnswerView[];
  noticeId: string;
}) {
  const found = findPublishedAnswer(answers, citation.answer_key);
  // Not found among the answers, or found once but since withdrawn in e-Avrop: either way there is no source to show.
  const problem =
    citation.check === "unverified" ? "Hittades inte bland inköps svar" : "Svaret finns inte längre bland inköps svar";
  // As a document quote says "s. 9 (AI angav 7)", a quote found in another answer says which one the AI named.
  const moved = citation.check === "moved" ? ` (AI angav fråga ${citation.answer})` : "";
  return (
    <VStack gap={1}>
      {found && (
        <Text type="supporting" maxLines={3}>
          {`${answerMeta(found.number, found.entry)}: ${paragraphsOf(found.entry.question).join(" ")}`}
        </Text>
      )}
      <AnswerText text={citation.quote} label="Inköp svarade" />
      {citation.check === "unverified" || !found ? (
        <Token label={problem} color="yellow" size="sm" icon={<Icon icon="warning" size="sm" />} />
      ) : (
        <Text type="supporting">
          Källa:{" "}
          <Link href={`/upphandlingar/${noticeId}#${answerAnchor(found.entry.key)}`} size="sm" hasUnderline>
            {`${PUBLISHED_ANSWERS_TITLE}, fråga ${found.number}${moved}`}
          </Link>
        </Text>
      )}
    </VStack>
  );
}
