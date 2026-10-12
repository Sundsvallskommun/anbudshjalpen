import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatComposer, ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { IsoDateTime, NoticeDetail } from "../../api/types";
import { calendarDateOf, formatLongDate, isPassed } from "../../lib/format";
import { useIsPhone } from "../../lib/usePhone";
import { AnswerCard } from "../../pages/notice/steps/question/AnswerCard";
import { EXAMPLE_QUESTIONS as RULES_EXAMPLES } from "../../pages/rules/rulesAnswer";
import { RulesAnswerCard } from "../../pages/rules/RulesAnswerCard";
import { ErrorNotice } from "../states";
import { DownloadIcon } from "../ui/icons";
import { isPending as isTurnPending, noticeScope, questionProblem, RULES_SCOPE, scopeKey, type AskScope, type Turn } from "./askAiState";
import { useAskAi, type AskAiApi } from "./AskAiProvider";

export const ASK_AI_TITLE = "Fråga AI";
const RULES_SUBJECT = "Reglerna för offentlig upphandling";

/** Questions most companies have about a procurement's documents, to ask with one press. */
export const NOTICE_EXAMPLES: readonly string[] = [
  "Vilka försäkringar måste vi ha?",
  "Vilka bilagor ska vara med i anbudet?",
  "Hur viktigt är priset?",
  "Får vi anlita underleverantörer?",
];

/** What the answers about a notice rest on, and where an open question goes (likabehandling). */
export function questionIntro(questionDeadline: IsoDateTime | null): string {
  const lead = "Svaren bygger bara på underlaget och visar var det står.";
  if (!questionDeadline) {
    return `${lead} Är något oklart? Ställ frågan i e-Avrop före sista dag för frågor, så får alla leverantörer samma svar.`;
  }
  const date = formatLongDate(calendarDateOf(questionDeadline), "auto");
  if (isPassed(questionDeadline)) return `${lead} Sista dag för frågor var ${date}.`;
  return `${lead} Är något oklart? Ställ frågan i e-Avrop senast ${date}, så får alla leverantörer samma svar.`;
}

const RULES_INTRO = "Svaren visar vilka paragrafer de bygger på. Det är alltid lagtexten som gäller.";

/** The address of the print view for a conversation: the browser prints it or saves it as PDF. */
export function exportHref(scope: AskScope): string {
  return `/fraga-ai/utskrift?amne=${encodeURIComponent(scopeKey(scope))}`;
}

function subjectOf(scope: AskScope, notice: NoticeDetail | null): string {
  return scope.kind === "notice" && notice ? notice.title : RULES_SUBJECT;
}

/** "Underlaget" or "Reglerna", on a notice page where both are at hand; elsewhere only the rules are. */
function Subject({ ai }: { ai: AskAiApi }) {
  const { notice, scope } = ai;
  if (!notice) return null;
  return (
    <HStack hAlign="start">
      <SegmentedControl
        label="Vad frågan gäller"
        value={scope.kind}
        onChange={(value) => ai.chooseScope(value === "rules" ? RULES_SCOPE : noticeScope(notice.id))}
        size="sm"
      >
        <SegmentedControlItem value="notice" label="Underlaget" />
        <SegmentedControlItem value="rules" label="Reglerna" />
      </SegmentedControl>
    </HStack>
  );
}

function Pending() {
  return (
    <Card>
      <HStack gap={2} vAlign="center" role="status">
        <HStack aria-hidden="true">
          <Spinner size="sm" />
        </HStack>
        <Text color="secondary">Letar i underlaget …</Text>
      </HStack>
    </Card>
  );
}

/** The answer to one turn, by what the conversation is about; a failed turn says so and offers to ask again. */
function Answer({ turn, ai }: { turn: Turn; ai: AskAiApi }) {
  if (turn.error !== null) {
    return <ErrorNotice title="Frågan kunde inte besvaras" error={new Error(turn.error)} onRetry={ai.isPending ? undefined : () => ai.retry(turn.id)} />;
  }
  if (ai.scope.kind === "rules") return <RulesAnswerCard question={turn.question} view={turn.rules} />;
  if (!turn.answer) return <Pending />;
  if (!ai.notice) return <Text>Öppna upphandlingen för att läsa svaret.</Text>;
  return <AnswerCard view={turn.answer} question={turn.question} notice={ai.notice} />;
}

/** The conversation as the design system's message list: the reader's bubbles and the answers as cards. */
function Thread({ ai }: { ai: AskAiApi }) {
  const intro = ai.scope.kind === "notice" && ai.notice ? questionIntro(ai.notice.question_deadline) : RULES_INTRO;
  return (
    <ChatMessageList align="top" density="compact" isStreaming={ai.turns.some(isTurnPending)} emptyState={<Text color="secondary">{intro}</Text>}>
      {ai.turns.map((turn) => (
        <Fragment key={turn.id}>
          <ChatMessage sender="user">
            <ChatMessageBubble name="Du">{turn.question}</ChatMessageBubble>
          </ChatMessage>
          <ChatMessage sender="assistant">
            <ChatMessageBubble variant="ghost" width="100%">
              <VStack as="article" aria-label={`Svar på ”${turn.question}”`}>
                <Answer turn={turn} ai={ai} />
              </VStack>
            </ChatMessageBubble>
          </ChatMessage>
        </Fragment>
      ))}
    </ChatMessageList>
  );
}

/** Questions to ask with one press; one that has been asked is not offered again. */
function Suggestions({ ai }: { ai: AskAiApi }) {
  const labelId = useId();
  const examples = ai.scope.kind === "notice" ? NOTICE_EXAMPLES : RULES_EXAMPLES;
  const asked = ai.turns.map((turn) => turn.question);
  const left = examples.filter((example) => !asked.includes(example));
  if (left.length === 0) return null;
  return (
    <VStack gap={2}>
      <Text type="supporting" weight="semibold" id={labelId}>
        {asked.length > 0 ? "Fler frågor du kan ställa" : "Exempel på frågor"}
      </Text>
      <HStack as="ul" role="list" aria-labelledby={labelId} gap={2} wrap="wrap">
        {left.map((example) => (
          <li key={example}>
            <Button label={example} size="sm" variant="secondary" onClick={() => !ai.isPending && ai.ask(example)} />
          </li>
        ))}
      </HStack>
    </VStack>
  );
}

/**
 * The writing field and what goes with it: the design system's composer, the line that the answers are a support,
 * and the actions on the conversation, printing it (saving as PDF) and clearing it.
 */
function Writing({ ai }: { ai: AskAiApi }) {
  const [problem, setProblem] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const hasAnswers = ai.turns.some((turn) => turn.answer !== null || turn.rules !== null);

  // A question handed over with the panel goes straight to the field, so the reader can send or change it.
  useEffect(() => {
    if (!ai.isOpen || !ai.focusField) return;
    const frame = requestAnimationFrame(() => {
      area.current?.querySelector<HTMLElement>("textarea, [contenteditable='true'], [role='textbox']")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [ai.isOpen, ai.focusField]);

  const submit = (value: string) => {
    const found = questionProblem(value);
    if (found) {
      setProblem(found);
      return;
    }
    if (ai.isPending) return;
    setProblem(null);
    ai.setDraft("");
    ai.ask(value);
  };

  const note = ai.scope.kind === "notice" ? "Svaren är ett stöd. Det är alltid förfrågningsunderlaget som gäller." : "Svaren är ett stöd, inte juridisk rådgivning. Det är alltid lagtexten som gäller.";
  return (
    <VStack gap={2} ref={area}>
      <ChatComposer
        value={ai.draft}
        onChange={(value) => {
          ai.setDraft(value);
          if (problem) setProblem(null);
        }}
        onSubmit={submit}
        placeholder={ai.scope.kind === "notice" ? "Till exempel: Hur många referensuppdrag behövs?" : "Till exempel: Vad är ett tilldelningsbeslut?"}
        density="compact"
        elevation="none"
        status={problem ? { type: "error", message: problem } : undefined}
      />
      <Text type="supporting">{note}</Text>
      {ai.turns.length > 0 && (
        <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
          {hasAnswers ? (
            <Button label="Spara som PDF" variant="secondary" size="sm" href={exportHref(ai.scope)} icon={<Icon icon={DownloadIcon} />} />
          ) : (
            <span />
          )}
          <Button label="Rensa samtalet" variant="ghost" size="sm" onClick={ai.clear} />
        </HStack>
      )}
    </VStack>
  );
}

function SheetHeading({ title, isOpen }: { title: string; isOpen: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Focus moves to the title, as in the dialog (WCAG 3.2.4: the same control behaves the same everywhere).
  useEffect(() => {
    if (isOpen) ref.current?.focus();
  }, [isOpen]);
  return (
    <Heading level={2} ref={ref} tabIndex={-1}>
      {title}
    </Heading>
  );
}

/**
 * The "Fråga AI" panel (decision 0014): the one place to ask about a notice's documents or the rules, opened from the
 * button that follows the reader or from "Ställ en fråga" and "Fråga om kravet". A dialog docked at the end of the
 * viewport on wider screens and a tall bottom sheet on a phone, with the same content: the subject, the conversation
 * as a message list, example questions and the composer. Rendered once by AppFrame; open it with useAskAi().
 */
export function AskAiPanel() {
  const ai = useAskAi();
  const isPhone = useIsPhone();
  const onOpenChange = (open: boolean) => {
    if (!open) ai.close();
  };
  const subtitle = subjectOf(ai.scope, ai.notice);

  if (isPhone) {
    return (
      <BottomSheet isOpen={ai.isOpen} onOpenChange={onOpenChange} label={ASK_AI_TITLE} height="tall" finalFocusRef={ai.openerRef}>
        <VStack gap={4} padding={4}>
          <VStack gap={1}>
            <SheetHeading title={ASK_AI_TITLE} isOpen={ai.isOpen} />
            <Text type="supporting">{subtitle}</Text>
          </VStack>
          <Subject ai={ai} />
          <Thread ai={ai} />
          <Suggestions ai={ai} />
          <Writing ai={ai} />
        </VStack>
      </BottomSheet>
    );
  }
  return (
    <Dialog isOpen={ai.isOpen} onOpenChange={onOpenChange} width={600} maxHeight="88dvh" position={{ end: 24, bottom: 24 }}>
      {/* The header is always mounted: the dialog takes its accessible name from the title. */}
      <Layout
        header={<DialogHeader title={ASK_AI_TITLE} subtitle={subtitle} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <Subject ai={ai} />
              <Thread ai={ai} />
              <Suggestions ai={ai} />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <Writing ai={ai} />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
