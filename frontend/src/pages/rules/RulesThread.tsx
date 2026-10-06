import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef } from "react";
import { RulesAnswerCard } from "./RulesAnswerCard";
import { QuestionBubble } from "./QuestionBubble";
import type { RulesTurn } from "./useRulesConversation";

/**
 * The conversation in the order it was asked (the Fråga step's pattern): the question on the right, the answer on a
 * card below it. When an answer arrives whose question has scrolled out of view above, the turn is brought back to
 * its start, so the reader begins with the question rather than in the middle of the answer.
 */
export function RulesThread({ turns, answeredId }: { turns: readonly RulesTurn[]; answeredId: number | null }) {
  const items = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (answeredId === null) return;
    const item = items.current.get(answeredId);
    if (item && item.getBoundingClientRect().top < 0) item.scrollIntoView?.({ block: "start" });
  }, [answeredId]);

  return (
    <VStack as="ol" role="list" gap={6} aria-label="Dina frågor och svaren">
      {turns.map((turn) => (
        <VStack
          as="li"
          key={turn.id}
          gap={2}
          ref={(element: HTMLElement | null) => {
            if (element) items.current.set(turn.id, element);
            else items.current.delete(turn.id);
          }}
        >
          <QuestionBubble question={turn.question} />
          <RulesAnswerCard question={turn.question} view={turn.view} />
        </VStack>
      ))}
    </VStack>
  );
}
