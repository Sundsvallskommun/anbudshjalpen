import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useAskQuestion } from "../../api/queries";
import type { AnswerView, NoticeDetail } from "../../api/types";
import { CitationChip } from "../../components/citations/CitationChip";
import { FormalQuestionAdvice } from "../../components/FormalQuestionAdvice";
import { Row, RowList } from "../../components/RowList";
import { ErrorNotice } from "../../components/states";
import { engineLabel } from "../../lib/labels";
import { formalQuestionLink, procurementLink } from "../../lib/links";
import { answerDocumentId } from "./noticeData";

const EXAMPLES = [
  "Vilka försäkringar måste vi ha?",
  "Vilka bilagor ska vara med i anbudet?",
  "Hur viktigt är priset?",
  "Får vi anlita underleverantörer?",
];
const MAX_LENGTH = 2000;
const HISTORY_TURNS = 10;

interface Turn {
  question: string;
  view: AnswerView;
}

/** Paragraphs as the model wrote them, separated by blank lines. */
function Paragraphs({ text }: { text: string }) {
  return (
    <VStack gap={2}>
      {text
        .split(/\n\s*\n/u)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <Text as="p" key={index}>
            {paragraph.trim()}
          </Text>
        ))}
    </VStack>
  );
}

function AnswerItem({ turn, notice }: { turn: Turn; notice: NoticeDetail }) {
  const { answer, engine, question_deadline: questionDeadline } = turn.view;
  // The backend says which document it read; without that, it read the first one.
  const documentId: string | undefined = turn.view.document_id ?? answerDocumentId(notice);
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Text type="supporting">Din fråga</Text>
        <Heading level={3}>{turn.question}</Heading>
      </VStack>
      <Paragraphs text={answer.answer} />
      {!answer.found_in_document && (
        <Banner
          status="warning"
          title="Svaret står inte i underlaget"
          description="Underlaget ger inget säkert svar på frågan."
          collapsible={false}
        />
      )}
      {answer.citations.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {answer.citations.map((citation, index) => (
            <CitationChip key={index} citation={citation} documentId={documentId} />
          ))}
        </HStack>
      )}
      {(answer.suggest_formal_question || !answer.found_in_document) && (
        <FormalQuestionAdvice
          noticeId={notice.id}
          questionDeadline={questionDeadline}
          link={formalQuestionLink(notice, turn.view.formal_question_url)}
          isFictitiousWithoutPage={notice.is_fictitious && !procurementLink(notice)}
        />
      )}
      <Text type="supporting">{`AI-genererat svar (${engineLabel(engine)}). Kontrollera alltid mot underlaget.`}</Text>
    </VStack>
  );
}

/** Journey step 5: questions answered from the document, with quotes and pages. */
export function QuestionTab({ notice }: { notice: NoticeDetail }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const ask = useAskQuestion(notice.id);

  if (!notice.has_documents) {
    return (
      <EmptyState
        headingLevel={2}
        title="Det finns inget underlag att fråga om ännu"
        description="När underlaget finns kan du ställa frågor om det här."
      />
    );
  }

  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    setQuestion(trimmed);
    // `turns` is newest first; the backend wants the latest turns in the order they were asked.
    const history = turns.slice(0, HISTORY_TURNS).reverse().map((turn) => ({
      question: turn.question,
      answer: turn.view.answer.answer.slice(0, 8000),
    }));
    ask.mutate(
      { question: trimmed, history },
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

  const tooLong = question.length > MAX_LENGTH;
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>Fråga underlaget</Heading>
        <Text color="secondary">
          Svaren bygger bara på underlaget och visar var det står. Frågor som rör ditt eget anbud ställer du
          formellt i e-Avrop.
        </Text>
      </VStack>
      <form onSubmit={onSubmit} aria-label="Ställ en fråga om underlaget">
        <VStack gap={3}>
          <TextArea
            label="Din fråga"
            value={question}
            onChange={setQuestion}
            rows={3}
            maxLength={MAX_LENGTH}
            placeholder="Till exempel: Hur många referensuppdrag behövs?"
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
            {ask.isPending && <Text color="secondary">Läser underlaget och letar efter svaret …</Text>}
          </HStack>
        </VStack>
      </form>
      {turns.length === 0 && !ask.isPending && (
        <VStack gap={2}>
          <Text weight="semibold">Exempel på frågor</Text>
          <HStack gap={2} wrap="wrap">
            {EXAMPLES.map((example) => (
              <Button key={example} label={example} size="sm" variant="secondary" onClick={() => send(example)} />
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
              <AnswerItem turn={turn} notice={notice} />
            </Row>
          ))}
        </RowList>
      )}
    </VStack>
  );
}
