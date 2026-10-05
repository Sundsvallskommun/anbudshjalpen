import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useAskRules } from "../api/queries";
import type { RuleSource, RulesView } from "../api/types";
import { Row, RowList } from "../components/RowList";
import { ErrorNotice } from "../components/states";
import { engineLabel } from "../lib/labels";
import { Page } from "../shell/Page";

const EXAMPLES = [
  "Vad är avtalsspärr?",
  "Vad är skillnaden mellan skallkrav och utvärderingskriterier?",
  "Får vi lämna anbud tillsammans med ett annat företag?",
  "Vad gäller för upphandlingar under tröskelvärdena?",
];
const MAX_LENGTH = 2000;

interface Turn {
  question: string;
  view: RulesView;
}

function SourceItem({ source }: { source: RuleSource }) {
  const text = source.reference ? `${source.reference}: ${source.title}` : source.title;
  return source.url ? (
    <Link href={source.url} isExternalLink>
      {text}
    </Link>
  ) : (
    <Text>{text}</Text>
  );
}

function RulesAnswerItem({ turn }: { turn: Turn }) {
  const { answer, engine } = turn.view;
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Text type="supporting">Din fråga</Text>
        <Heading level={3}>{turn.question}</Heading>
      </VStack>
      <VStack gap={2}>
        {answer.answer
          .split(/\n\s*\n/u)
          .filter((paragraph) => paragraph.trim())
          .map((paragraph, index) => (
            <Text as="p" key={index}>
              {paragraph.trim()}
            </Text>
          ))}
      </VStack>
      {answer.sources.length > 0 ? (
        <VStack gap={1}>
          <Text weight="semibold">Källor</Text>
          <VStack as="ul" role="list" gap={1} aria-label="Källor">
            {answer.sources.map((source, index) => (
              <li key={index}>
                <SourceItem source={source} />
              </li>
            ))}
          </VStack>
        </VStack>
      ) : (
        <Text color="secondary">Svaret har ingen källa. Kontrollera det innan du förlitar dig på det.</Text>
      )}
      <Text type="supporting">{`AI-genererat svar (${engineLabel(engine)}). Det är allmän vägledning, inte juridisk rådgivning.`}</Text>
    </VStack>
  );
}

/** General questions about procurement rules (LOU, guidance, local rules), answered with sources. */
export default function RulesPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const ask = useAskRules();
  const sessionId = turns[0]?.view.answer.session_id ?? null;

  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    setQuestion(trimmed);
    ask.mutate(
      { question: trimmed, session_id: sessionId },
      {
        onSuccess: (view) => {
          setTurns((previous) => [{ question: trimmed, view }, ...previous]);
          setQuestion("");
        },
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(question);
  };

  const startOver = () => {
    setTurns([]);
    setQuestion("");
    ask.reset();
  };

  const tooLong = question.length > MAX_LENGTH;
  return (
    <Page
      title="Regelhjälpen"
      width={760}
      intro="Fråga om upphandlingsregler, till exempel lagen om offentlig upphandling (LOU), vägledningar och kommunens egna regler. Svaren hänvisar till källan. Frågor om en viss upphandling ställer du på upphandlingens sida."
    >
      <form onSubmit={onSubmit} aria-label="Ställ en fråga till Regelhjälpen">
        <VStack gap={3}>
          <TextArea
            label="Din fråga"
            value={question}
            onChange={setQuestion}
            rows={3}
            maxLength={MAX_LENGTH}
            status={tooLong ? { type: "error", message: `Frågan får vara högst ${MAX_LENGTH} tecken.` } : undefined}
          />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button
              type="submit"
              label="Fråga"
              variant="primary"
              isLoading={ask.isPending}
              isDisabled={question.trim().length < 3 || tooLong}
            />
            {turns.length > 0 && <Button label="Ny fråga från början" variant="ghost" onClick={startOver} />}
            {ask.isPending && <Text color="secondary">Letar i regler och vägledningar …</Text>}
          </HStack>
        </VStack>
      </form>
      {turns.length === 0 && !ask.isPending && (
        <VStack gap={2}>
          <Text weight="semibold">Exempel på frågor</Text>
          <HStack gap={2} wrap="wrap">
            {EXAMPLES.map((example) => (
              <Button key={example} label={example} size="sm" onClick={() => send(example)} />
            ))}
          </HStack>
        </VStack>
      )}
      {ask.isError && <ErrorNotice title="Frågan kunde inte besvaras" error={ask.error} />}
      <Text role="status" type="supporting">
        {turns[0] ? `Svaret på frågan ”${turns[0].question}” visas överst.` : ""}
      </Text>
      {turns.length > 0 && (
        <RowList label="Frågor och svar">
          {turns.map((turn, index) => (
            <Row key={turns.length - index}>
              <RulesAnswerItem turn={turn} />
            </Row>
          ))}
        </RowList>
      )}
    </Page>
  );
}
