import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import styles from "./QuestionBubble.module.css";

/**
 * The question as the asker wrote it, right-aligned on the accent's tint (the Fråga step's thread). It is the turn's
 * heading, so a screen reader's list of headings is the list of questions, while it looks like body text. Astryx's
 * ChatMessage would wrap it in an article named after its sender role ("Meddelande från user"), which an ordered
 * thread of headings does not need.
 */
export function QuestionBubble({ question }: { question: string }) {
  return (
    <VStack gap={1} hAlign="end">
      <Heading level={4} accessibilityLevel={2} weight="normal" className={styles.bubble}>
        <VisuallyHidden>Din fråga:</VisuallyHidden> {question}
      </Heading>
      <Text type="supporting" aria-hidden="true">
        Du
      </Text>
    </VStack>
  );
}
