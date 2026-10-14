import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { lazy, Suspense, useId } from "react";
import type { RulesView, TokenUsageView } from "../../api/types";
import { AiProvenance } from "../../components/ui/AiProvenance";
import { ToolsUsed } from "../../components/ui/ToolsUsed";
import { RuleSourceCard } from "./RuleSourceCard";
import { needsSourceWarning, parseRulesAnswer, sourcesHeading, type RulesAnswerParts } from "./rulesAnswer";

// The Markdown parser is most of this page's weight and only a language model's explanation needs it (lists, bold):
// it is fetched the first time an answer has one, and the text shows as plain paragraphs until then.
const Markdown = lazy(() => import("@astryxdesign/core/Markdown").then((module) => ({ default: module.Markdown })));

/** The explanation as plain paragraphs, while the Markdown renderer loads. */
function PlainText({ text }: { text: string }) {
  return (
    <VStack gap={2}>
      {text.split(/\n\s*\n/u).map((paragraph, index) => (
        <Text as="p" key={index}>
          {paragraph}
        </Text>
      ))}
    </VStack>
  );
}

/**
 * "Svar" and the provenance line, read before the answer (direction.md, section 2). The answer rests on the law, so
 * the popover says how the paragraphs are shown and that the law text is what applies.
 */
function AnswerHeader({ engine, usage }: { engine?: string; usage?: TokenUsageView | null }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Text type="supporting" color="primary" weight="semibold">
        Svar
      </Text>
      {engine && <AiProvenance engine={engine} basis="law" howLabel="Hur togs svaret fram?" usage={usage} />}
    </HStack>
  );
}

/**
 * The paragraphs the answer rests on, one card each. Without a conclusion (the rule-based engine) the heading opens
 * the answer in the conclusion's weight, "Paragrafer som kan handla om din fråga"; after one it is the quiet lead-in
 * the Fråga step uses before its quotes ("Svaret bygger på").
 */
function SourceList({ parts, view }: { parts: RulesAnswerParts; view: RulesView }) {
  const headingId = useId();
  const opensAnswer = parts.lead === null && !parts.body;
  return (
    <VStack gap={opensAnswer ? 3 : 2}>
      <Heading level={opensAnswer ? 4 : 5} accessibilityLevel={3} color={opensAnswer ? "primary" : "secondary"} id={headingId}>
        {sourcesHeading(parts)}
      </Heading>
      <VStack as="ul" role="list" gap={3} aria-labelledby={headingId}>
        {view.answer.sources.map((source, index) => (
          <li key={`${source.reference ?? source.title}-${index}`}>
            <RuleSourceCard source={source} />
          </li>
        ))}
      </VStack>
    </VStack>
  );
}

/** A language model's answer without any source is said to be one: every claim should be traceable. */
function UnsourcedNote() {
  return (
    <HStack gap={2} vAlign="start">
      <HStack height={20} vAlign="center">
        <Icon icon="warning" color="warning" size="sm" />
      </HStack>
      <Text type="supporting" color="primary">
        Svaret hänvisar inte till någon paragraf. Kontrollera det innan du förlitar dig på det.
      </Text>
    </HStack>
  );
}

function AnswerContent({ view }: { view: RulesView }) {
  const parts = parseRulesAnswer(view.answer);
  return (
    <>
      <AnswerHeader engine={view.engine} usage={view.usage} />
      {(parts.lead || parts.body) && (
        <VStack gap={2}>
          {parts.lead && (
            <Text as="p" weight="semibold">
              {parts.lead}
            </Text>
          )}
          {parts.body && (
            <Suspense fallback={<PlainText text={parts.body} />}>
              <Markdown headingLevelStart={3} contentWidth="100%">
                {parts.body}
              </Markdown>
            </Suspense>
          )}
        </VStack>
      )}
      {view.answer.sources.length > 0 && <SourceList parts={parts} view={view} />}
      {needsSourceWarning(view) && <UnsourcedNote />}
      <ToolsUsed tools={view.tools ?? []} />
    </>
  );
}

/** While the answer is on its way: the same card, busy, with a quiet spinner (the page's status line speaks). */
function Pending() {
  return (
    <>
      <AnswerHeader />
      <HStack gap={2} vAlign="center">
        <HStack aria-hidden="true">
          <Spinner size="sm" />
        </HStack>
        <Text color="secondary">Letar i lagen och vägledningarna …</Text>
      </HStack>
    </>
  );
}

/**
 * The answer to one question, on a card (direction.md, section 4 "Regelhjälpen"): the provenance line, a bold
 * conclusion, the explanation and one card per paragraph it rests on. The rule-based engine has no conclusion to
 * draw, so its answer opens with the paragraphs. While the answer is on its way the same card is busy, so a screen
 * reader waits and then reads the answer.
 */
export function RulesAnswerCard({ question, view }: { question: string; view: RulesView | null }) {
  return (
    <Card role="article" aria-label={`Svar på: ${question}`} aria-busy={view === null ? true : undefined}>
      <VStack gap={4}>{view ? <AnswerContent view={view} /> : <Pending />}</VStack>
    </Card>
  );
}
