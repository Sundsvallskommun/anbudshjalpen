import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatMessage, ChatMessageBubble } from "@astryxdesign/core/Chat";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useAskQuestion } from "../../../../api/queries";
import type { AnswerView, NoticeDetail, QuestionTurnIn } from "../../../../api/types";
import { ErrorNotice } from "../../../../components/states";
import { AnswerCard } from "./AnswerCard";
import { Composer, questionProblem } from "./Composer";

/** The parameter that puts a question in the composer ("Fråga om kravet" in step 3). */
export const QUESTION_PARAM = "fraga";

const EXAMPLES = [
  "Vilka försäkringar måste vi ha?",
  "Vilka bilagor ska vara med i anbudet?",
  "Hur viktigt är priset?",
  "Får vi anlita underleverantörer?",
];
/** How many earlier turns go with a question, as the backend's limit. */
const HISTORY_TURNS = 10;
const HISTORY_ANSWER_CHARS = 8000;

type Turn =
  | { id: number; question: string; state: "pending" }
  | { id: number; question: string; state: "answered"; view: AnswerView }
  | { id: number; question: string; state: "failed"; error: unknown };

function history(turns: readonly Turn[]): QuestionTurnIn[] {
  return turns
    .filter((turn): turn is Extract<Turn, { state: "answered" }> => turn.state === "answered")
    .slice(-HISTORY_TURNS)
    .map((turn) => ({ question: turn.question, answer: turn.view.answer.answer.slice(0, HISTORY_ANSWER_CHARS) }));
}

function Pending() {
  return (
    <Card>
      <HStack gap={2} vAlign="center">
        <Spinner size="sm" label="Letar i underlaget" />
        <Text color="secondary">Letar i underlaget …</Text>
      </HStack>
    </Card>
  );
}

function Suggestions({ asked, onAsk, hasTurns }: { asked: readonly string[]; onAsk: (question: string) => void; hasTurns: boolean }) {
  const labelId = useId();
  const left = EXAMPLES.filter((example) => !asked.includes(example));
  if (left.length === 0) return null;
  return (
    <VStack gap={2}>
      <Text type="supporting" weight="semibold" id={labelId}>
        {hasTurns ? "Fler frågor du kan ställa" : "Exempel på frågor"}
      </Text>
      <HStack as="ul" role="list" aria-labelledby={labelId} gap={2} wrap="wrap">
        {left.map((example) => (
          <li key={example}>
            <Button label={example} size="sm" variant="secondary" onClick={() => onAsk(example)} />
          </li>
        ))}
      </HStack>
    </VStack>
  );
}

/**
 * The questions and answers of this visit as a thread, oldest first (direction.md, section 4 "Steg 2 Fråga"): each
 * question as the reader's bubble ("Du") and its answer as a card below. Suggestions and the composer follow;
 * `?fraga=` puts a question in the composer.
 */
export function Conversation({ notice }: { notice: NoticeDetail }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const nextId = useRef(1);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const ask = useAskQuestion(notice.id);
  const [params, setParams] = useSearchParams();
  const prefill = params.get(QUESTION_PARAM);

  // A question handed over in the address goes into the composer, once; the step bar has focused the panel by then.
  useEffect(() => {
    if (prefill === null) return;
    setDraft(prefill);
    setProblem(null);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(QUESTION_PARAM);
        return next;
      },
      { replace: true },
    );
    const frame = requestAnimationFrame(() => fieldRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [prefill]);

  const send = (text: string) => {
    const question = text.trim();
    const found = questionProblem(question);
    if (found) {
      setProblem(found);
      fieldRef.current?.focus();
      return;
    }
    if (ask.isPending) return;
    const id = nextId.current++;
    setProblem(null);
    setDraft("");
    setTurns((previous) => [...previous, { id, question, state: "pending" }]);
    ask.mutate(
      { question, history: history(turns) },
      {
        onSuccess: (view) =>
          setTurns((previous) => previous.map((turn) => (turn.id === id ? { id, question, state: "answered", view } : turn))),
        onError: (error) =>
          setTurns((previous) => previous.map((turn) => (turn.id === id ? { id, question, state: "failed", error } : turn))),
      },
    );
  };

  const retry = (turn: Turn) => {
    setTurns((previous) => previous.filter((candidate) => candidate.id !== turn.id));
    send(turn.question);
  };

  return (
    <VStack gap={6}>
      {turns.length > 0 && (
        // A log, as the design system's chat list is, but on the page's own content line: a screen reader hears each
        // answer once it is complete (aria-busy while one is on its way).
        <VStack role="log" aria-label="Frågor och svar" aria-live="polite" aria-busy={ask.isPending} gap={4}>
          {turns.map((turn) => (
            <VStack key={turn.id} gap={3}>
              <ChatMessage sender="user" name="Du">
                <ChatMessageBubble>{turn.question}</ChatMessageBubble>
              </ChatMessage>
              <VStack as="article" aria-label={`Svar på ”${turn.question}”`}>
                {turn.state === "pending" && <Pending />}
                {turn.state === "answered" && <AnswerCard view={turn.view} question={turn.question} notice={notice} />}
                {turn.state === "failed" && (
                  <ErrorNotice title="Frågan kunde inte besvaras" error={turn.error} onRetry={ask.isPending ? undefined : () => retry(turn)} />
                )}
              </VStack>
            </VStack>
          ))}
        </VStack>
      )}
      <Suggestions asked={turns.map((turn) => turn.question)} onAsk={send} hasTurns={turns.length > 0} />
      <Composer
        value={draft}
        onChange={(value) => {
          setDraft(value);
          if (problem) setProblem(null);
        }}
        onSubmit={() => send(draft)}
        problem={problem}
        isSending={ask.isPending}
        fieldRef={fieldRef}
      />
    </VStack>
  );
}
