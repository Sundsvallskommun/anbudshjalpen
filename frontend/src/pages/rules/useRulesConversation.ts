import { useRef, useState } from "react";
import { useAskRules } from "../../api/queries";
import type { RulesView } from "../../api/types";
import { latestSessionId } from "./rulesAnswer";

/** One question and its answer; `view` is null while the answer is on its way. */
export interface RulesTurn {
  id: number;
  question: string;
  view: RulesView | null;
}

export interface AskHandlers {
  onAnswer?: (turn: RulesTurn) => void;
  onError?: (error: unknown, question: string) => void;
}

/**
 * The conversation on Regelhjälpen, oldest question first like the Fråga step. A question shows at once with its
 * answer pending; a failed question leaves the thread again so it can be asked anew. Follow-ups continue the
 * engine's conversation (`session_id`), which only this browser can continue; nothing is stored.
 */
export function useRulesConversation() {
  const ask = useAskRules();
  const [turns, setTurns] = useState<RulesTurn[]>([]);
  const nextId = useRef(1);
  // Starting over while an answer is on its way must not bring that answer back into the empty thread.
  const generation = useRef(0);

  const send = (question: string, handlers: AskHandlers = {}) => {
    if (ask.isPending) return;
    const id = nextId.current++;
    const sentIn = generation.current;
    const sessionId = latestSessionId(turns.map((turn) => turn.view));
    setTurns((previous) => [...previous, { id, question, view: null }]);
    ask.mutate(
      { question, session_id: sessionId },
      {
        onSuccess: (view) => {
          if (sentIn !== generation.current) return;
          setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...turn, view } : turn)));
          handlers.onAnswer?.({ id, question, view });
        },
        onError: (error) => {
          if (sentIn !== generation.current) return;
          setTurns((previous) => previous.filter((turn) => turn.id !== id));
          handlers.onError?.(error, question);
        },
      },
    );
  };

  const reset = () => {
    generation.current += 1;
    setTurns([]);
    ask.reset();
  };

  return { turns, isPending: ask.isPending, error: ask.isError ? ask.error : null, send, reset };
}
