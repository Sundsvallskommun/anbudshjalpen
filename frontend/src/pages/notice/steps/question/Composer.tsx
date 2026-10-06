import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import type { FormEvent, Ref } from "react";
import styles from "./Composer.module.css";

export const MAX_QUESTION_LENGTH = 2000;
export const MIN_QUESTION_LENGTH = 3;

/** Why a question cannot be sent, in words for the field, or null when it can. */
export function questionProblem(text: string): string | null {
  const length = text.trim().length;
  if (length < MIN_QUESTION_LENGTH) return "Skriv en fråga på minst tre tecken.";
  if (length > MAX_QUESTION_LENGTH) return "Frågan får vara högst 2 000 tecken.";
  return null;
}

/**
 * Where the reader writes a question: "Din fråga" and "Fråga". The button stays active and the field says what is
 * wrong when it is pressed (direction.md, section 10: primary buttons validate on submit instead of being disabled).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  problem,
  isSending,
  fieldRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** The field's error after a press, or null. */
  problem: string | null;
  isSending: boolean;
  fieldRef: Ref<HTMLTextAreaElement>;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <Card className={styles.composer} data-question-composer="">
      <form onSubmit={submit} aria-label="Ställ en fråga om underlaget" noValidate>
        <VStack gap={2}>
          <HStack gap={3} vAlign="end">
            <VStack className={styles.field}>
              <TextArea
                ref={fieldRef}
                label="Din fråga"
                value={value}
                onChange={onChange}
                rows={2}
                maxLength={MAX_QUESTION_LENGTH}
                placeholder="Till exempel: Hur många referensuppdrag behövs?"
                status={problem ? { type: "error", message: problem } : undefined}
                width="100%"
              />
            </VStack>
            <Button type="submit" label="Fråga" variant="primary" isLoading={isSending} />
          </HStack>
          <Text type="supporting">Svaren är ett stöd. Det är alltid förfrågningsunderlaget som gäller.</Text>
        </VStack>
      </form>
    </Card>
  );
}
