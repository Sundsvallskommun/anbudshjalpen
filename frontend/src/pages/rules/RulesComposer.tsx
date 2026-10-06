import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import type { FormEvent, Ref } from "react";
import { MAX_QUESTION_LENGTH } from "./rulesAnswer";

export interface RulesComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Why the question cannot be sent, shown at the field. */
  error: string | null;
  isPending: boolean;
  /** "Börja om" is offered once there is a conversation to leave. */
  onStartOver?: () => void;
  textAreaRef: Ref<HTMLTextAreaElement>;
}

/**
 * The writing field below the conversation, laid out as in the Fråga step (direction.md, section 4 "Steg 2 Fråga"):
 * two rows with "Fråga", the view's one primary button, beside them. The button is always active and the question
 * is checked when it is sent, instead of a disabled button with too little contrast (direction.md, section 10).
 */
export function RulesComposer({
  value,
  onChange,
  onSubmit,
  error,
  isPending,
  onStartOver,
  textAreaRef,
}: RulesComposerProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <Card>
      <form onSubmit={submit} aria-label="Ställ en fråga till Regelhjälpen" noValidate>
        <VStack gap={2}>
          <HStack gap={3} vAlign="end">
            <StackItem size="fill">
              <TextArea
                ref={textAreaRef}
                label="Din fråga"
                placeholder="Till exempel: Vad är ett tilldelningsbeslut?"
                value={value}
                onChange={onChange}
                rows={2}
                maxLength={MAX_QUESTION_LENGTH}
                status={error ? { type: "error", message: error } : undefined}
                width="100%"
              />
            </StackItem>
            <Button type="submit" label="Fråga" variant="primary" isLoading={isPending} />
          </HStack>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <Text type="supporting">Svaren är ett stöd, inte juridisk rådgivning. Det är alltid lagtexten som gäller.</Text>
            {onStartOver && <Button label="Börja om" variant="ghost" size="sm" onClick={onStartOver} />}
          </HStack>
        </VStack>
      </form>
    </Card>
  );
}
