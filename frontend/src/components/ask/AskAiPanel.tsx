import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatComposer, ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { Popover } from "@astryxdesign/core/Popover";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StackItem } from "@astryxdesign/core/Stack";
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
import { ChatIcon, CollapseIcon, DownloadIcon, ExpandIcon, TrashIcon } from "../ui/icons";
import styles from "./AskAiPanel.module.css";
import { isPending as isTurnPending, noticeScope, questionProblem, RULES_SCOPE, scopeKey, type AskScope, type Turn } from "./askAiState";
import { useAskAi, type AskAiApi } from "./AskAiProvider";

export const ASK_AI_TITLE = "Fråga AI";
const RULES_SUBJECT = "Reglerna för offentlig upphandling";
/**
 * The panel's sizes on wider screens. Compact by default, a column beside the page's content that leaves most of
 * the page in view; expanded for reading long answers with their quotes. Never the whole window.
 */
const PANEL_SIZE = {
  compact: { width: 420, height: "min(70dvh, 36rem)" },
  expanded: { width: 720, height: "min(86dvh, 56rem)" },
} as const;
type PanelSize = keyof typeof PANEL_SIZE;

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
    return <ErrorNotice title="Frågan kunde inte besvaras" error={turn.error} onRetry={ai.isPending ? undefined : () => ai.retry(turn.id)} />;
  }
  if (ai.scope.kind === "rules") return <RulesAnswerCard question={turn.question} view={turn.rules} />;
  if (!turn.answer) return <Pending />;
  if (!ai.notice) return <Text>Öppna upphandlingen för att läsa svaret.</Text>;
  return <AnswerCard view={turn.answer} question={turn.question} notice={ai.notice} />;
}

/**
 * The conversation as the design system's message list: the reader's bubbles and the answers as cards. Before the
 * first question, only what the answers rest on, as a quiet line: the list's empty state centres it with room to spare.
 * The reader's bubble carries no name: it sits to the right in its own colour, and a name over it only crowded the
 * question; the design system names the message for screen readers.
 */
function Thread({ ai }: { ai: AskAiApi }) {
  if (ai.turns.length === 0) {
    const intro = ai.scope.kind === "notice" && ai.notice ? questionIntro(ai.notice.question_deadline) : RULES_INTRO;
    return <Text type="supporting">{intro}</Text>;
  }
  return (
    <ChatMessageList align="top" density="compact" isStreaming={ai.turns.some(isTurnPending)}>
      {ai.turns.map((turn) => (
        <Fragment key={turn.id}>
          <ChatMessage sender="user">
            <ChatMessageBubble>{turn.question}</ChatMessageBubble>
          </ChatMessage>
          {/* The answer card flush with the panel's edge, not in a bubble's text column: the panel is narrow. */}
          <ChatMessage sender="assistant">
            <VStack as="article" aria-label={`Svar på ”${turn.question}”`} width="100%">
              <Answer turn={turn} ai={ai} />
            </VStack>
          </ChatMessage>
        </Fragment>
      ))}
    </ChatMessageList>
  );
}

/**
 * Questions to ask with one press, offered until the first question is asked: a reader with a conversation going
 * knows what to ask, and the examples only pushed the answers up.
 */
function Suggestions({ ai }: { ai: AskAiApi }) {
  const labelId = useId();
  if (ai.turns.length > 0) return null;
  const examples = ai.scope.kind === "notice" ? NOTICE_EXAMPLES : RULES_EXAMPLES;
  return (
    <VStack gap={2}>
      <Text type="supporting" weight="semibold" id={labelId}>
        Exempel på frågor
      </Text>
      <HStack as="ul" role="list" aria-labelledby={labelId} gap={2} wrap="wrap">
        {examples.map((example) => (
          <li key={example}>
            <Button label={example} size="sm" variant="secondary" onClick={() => !ai.isPending && ai.ask(example)} />
          </li>
        ))}
      </HStack>
    </VStack>
  );
}

/** The writing field and what goes with it: the design system's composer and the line that the answers are a support. */
function Writing({ ai }: { ai: AskAiApi }) {
  const [problem, setProblem] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

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
    </VStack>
  );
}

/**
 * The panel's header: a small title with the subject on one line under it, and the actions on the conversation as
 * quiet icon buttons with tooltips: save as PDF and clear once there is something to save or clear, make the panel
 * larger or smaller on wider screens, and close. The title is an h2 in the outline but set at a panel's size. On a
 * phone the sheet has no heading of its own, so the focus moves here (WCAG 3.2.4).
 */
function PanelHeader({
  ai,
  subtitle,
  takesFocus,
  size,
  onSizeChange,
}: {
  ai: AskAiApi;
  subtitle: string;
  takesFocus: boolean;
  size?: PanelSize;
  onSizeChange?: (size: PanelSize) => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takesFocus && ai.isOpen) ref.current?.focus();
  }, [takesFocus, ai.isOpen]);
  const hasAnswers = ai.turns.some((turn) => turn.answer !== null || turn.rules !== null);
  const isExpanded = size === "expanded";
  return (
    <HStack gap={2} vAlign="center">
      <HStack aria-hidden="true">
        <Icon icon={ChatIcon} color="accent" size="md" />
      </HStack>
      <StackItem size="fill">
        <VStack gap={0}>
          <Heading level={5} accessibilityLevel={2} ref={ref} tabIndex={takesFocus ? -1 : undefined}>
            {ASK_AI_TITLE}
          </Heading>
          <Text type="supporting" maxLines={1}>
            {subtitle}
          </Text>
        </VStack>
      </StackItem>
      <HStack gap={0.5} vAlign="center">
        {hasAnswers && (
          <Button label="Spara som PDF" tooltip="Spara som PDF" variant="ghost" size="sm" isIconOnly href={exportHref(ai.scope)} icon={<Icon icon={DownloadIcon} />} />
        )}
        {ai.turns.length > 0 && (
          <Button label="Rensa samtalet" tooltip="Rensa samtalet" variant="ghost" size="sm" isIconOnly onClick={ai.clear} icon={<Icon icon={TrashIcon} />} />
        )}
        {size && onSizeChange && (
          <Button
            label={isExpanded ? "Förminska panelen" : "Förstora panelen"}
            tooltip={isExpanded ? "Förminska" : "Förstora"}
            variant="ghost"
            size="sm"
            isIconOnly
            onClick={() => onSizeChange(isExpanded ? "compact" : "expanded")}
            icon={<Icon icon={isExpanded ? CollapseIcon : ExpandIcon} />}
          />
        )}
        <Button label="Stäng" tooltip="Stäng" variant="ghost" size="sm" isIconOnly onClick={ai.close} icon={<Icon icon="close" />} />
      </HStack>
    </HStack>
  );
}

/** The panel on wider screens: a fixed-height column whose conversation scrolls between the header and the field. */
function DockedPanel({
  ai,
  subtitle,
  size,
  onSizeChange,
}: {
  ai: AskAiApi;
  subtitle: string;
  size: PanelSize;
  onSizeChange: (size: PanelSize) => void;
}) {
  return (
    <VStack height={PANEL_SIZE[size].height} width="100%">
      <Layout
        height="fill"
        header={
          <LayoutHeader padding={3}>
            <PanelHeader ai={ai} subtitle={subtitle} takesFocus={false} size={size} onSizeChange={onSizeChange} />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={3}>
            <VStack gap={3}>
              <Subject ai={ai} />
              <Thread ai={ai} />
              <Suggestions ai={ai} />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={3}>
            <Writing ai={ai} />
          </LayoutFooter>
        }
      />
    </VStack>
  );
}

/**
 * "Fråga AI" (decision 0014): the button that follows the reader at the end of the viewport, and the panel it opens.
 * On wider screens the panel is a non-modal Astryx Popover anchored to the button, so the page stays readable and
 * usable while it is open and the source dialog can open above it; on a phone a tall bottom sheet without a scrim.
 * Both hold the same content: the subject, the conversation as a message list, example questions and the composer.
 * The popover opens compact and can be made larger for long answers.
 * Rendered once by AppFrame; open it from anywhere with useAskAi().
 */
export function AskAiWidget() {
  const ai = useAskAi();
  const isPhone = useIsPhone();
  const subtitle = subjectOf(ai.scope, ai.notice);
  // Kept while the panel is closed, so it opens at the size the reader chose.
  const [size, setSize] = useState<PanelSize>("compact");
  const onOpenChange = (open: boolean) => {
    if (open) ai.open();
    else ai.close();
  };

  if (isPhone) {
    return (
      <>
        <HStack className={styles.button} data-ask-ai-button="">
          <Button label={ASK_AI_TITLE} variant="primary" icon={<Icon icon={ChatIcon} />} onClick={() => ai.toggle()} />
        </HStack>
        <BottomSheet isOpen={ai.isOpen} onOpenChange={onOpenChange} label={ASK_AI_TITLE} height="tall" hasScrim={false} finalFocusRef={ai.openerRef}>
          <VStack gap={4} padding={4}>
            <PanelHeader ai={ai} subtitle={subtitle} takesFocus />
            <Subject ai={ai} />
            <Thread ai={ai} />
            <Suggestions ai={ai} />
            <Writing ai={ai} />
          </VStack>
        </BottomSheet>
      </>
    );
  }
  return (
    <HStack className={styles.button} data-ask-ai-button="">
      <Popover
        isOpen={ai.isOpen}
        onOpenChange={onOpenChange}
        isModal={false}
        hasLightDismiss={false}
        hasEscapeDismiss
        placement="above"
        alignment="end"
        width={PANEL_SIZE[size].width}
        label={ASK_AI_TITLE}
        closeButtonLabel="Stäng panelen"
        content={<DockedPanel ai={ai} subtitle={subtitle} size={size} onSizeChange={setSize} />}
      >
        <Button label={ASK_AI_TITLE} variant="primary" icon={<Icon icon={ChatIcon} />} />
      </Popover>
    </HStack>
  );
}
