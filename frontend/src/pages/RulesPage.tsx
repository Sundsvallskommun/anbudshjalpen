import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ErrorNotice } from "../components/states";
import { Page } from "../shell/Page";
import { RulesComposer } from "./rules/RulesComposer";
import { MAX_QUESTION_LENGTH, QUESTION_PARAM, questionError } from "./rules/rulesAnswer";
import { RulesRail } from "./rules/RulesRail";
import { RulesSuggestions } from "./rules/RulesSuggestions";
import { RulesThread } from "./rules/RulesThread";
import { useRulesConversation } from "./rules/useRulesConversation";

/**
 * "/regelhjalpen?fraga=…" asks the question on arrival (Start links its examples here) and then leaves the address,
 * so a reload does not ask it again. A question too short or too long is put in the field instead.
 */
function useLinkedQuestion(onQuestion: (question: string) => void) {
  const [params, setParams] = useSearchParams();
  const linked = params.get(QUESTION_PARAM);
  const handled = useRef(false);

  useEffect(() => {
    if (linked === null || handled.current) return;
    handled.current = true;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(QUESTION_PARAM);
        return next;
      },
      { replace: true },
    );
    onQuestion(linked);
  }, [linked]);
}

/**
 * Regelhjälpen (direction.md, section 4): general questions about procurement rules as a calm conversation, like
 * the Fråga step. Every answer opens with its provenance line and ends with the paragraphs it rests on, each a card
 * with the law's own words and a link to the whole paragraph. Open to everyone; nothing is stored.
 */
export default function RulesPage() {
  const conversation = useRulesConversation();
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [answeredId, setAnsweredId] = useState<number | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const ask = (question: string) => {
    setAnnouncement("Letar efter ett svar …");
    conversation.send(question.trim(), {
      onAnswer: (turn) => {
        setAnsweredId(turn.id);
        setAnnouncement(`Regelhjälpen har svarat på ”${turn.question}”.`);
      },
      onError: (_error, question) => {
        // The question is not lost: it is back in the field, below the message that says what went wrong.
        setDraft(question);
        setAnnouncement("");
      },
    });
  };

  const submitDraft = () => {
    const error = questionError(draft);
    setFieldError(error);
    if (error) {
      textArea.current?.focus();
      return;
    }
    if (conversation.isPending) return;
    ask(draft);
    setDraft("");
  };

  const changeDraft = (value: string) => {
    setDraft(value);
    if (fieldError) setFieldError(questionError(value));
  };

  const startOver = () => {
    conversation.reset();
    setDraft("");
    setFieldError(null);
    setAnsweredId(null);
    setAnnouncement("Frågorna är borttagna. Du kan börja om med en ny fråga.");
    textArea.current?.focus();
  };

  useLinkedQuestion((question) => {
    if (questionError(question) === null) ask(question);
    else setDraft(question.slice(0, MAX_QUESTION_LENGTH));
  });

  const hasConversation = conversation.turns.length > 0;
  return (
    <Page
      title="Regelhjälpen"
      intro="Ställ frågor om reglerna för offentlig upphandling. Varje svar visar vilka paragrafer i lagen det bygger på."
      rail={<RulesRail />}
      railLabel="Om Regelhjälpen"
    >
      {hasConversation && <RulesThread turns={conversation.turns} answeredId={answeredId} />}
      {conversation.error !== null && <ErrorNotice title="Frågan kunde inte besvaras" error={conversation.error} />}
      <RulesSuggestions
        asked={conversation.turns.map((turn) => turn.question)}
        onAsk={(question) => {
          if (!conversation.isPending) ask(question);
        }}
      />
      <RulesComposer
        value={draft}
        onChange={changeDraft}
        onSubmit={submitDraft}
        error={fieldError}
        isPending={conversation.isPending}
        onStartOver={hasConversation ? startOver : undefined}
        textAreaRef={textArea}
      />
      <VisuallyHidden as="div" role="status">
        {announcement}
      </VisuallyHidden>
    </Page>
  );
}
