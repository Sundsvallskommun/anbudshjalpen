import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate, useSearchParams } from "react-router";
import { useNotice } from "../api/queries";
import type { AnswerCitation, AnswerView, Citation, DocumentInfo, PublishedAnswerView, RulesView } from "../api/types";
import { useAskAi } from "../components/ask/AskAiProvider";
import { isAnswered, parseScopeKey, scopeKey, type AskScope, type Turn } from "../components/ask/askAiState";
import { formalQuestionSentence } from "../components/FormalQuestionAdvice";
import { answerMeta, findPublishedAnswer } from "../components/ui/PublishedAnswerQuote";
import { formatDateTime } from "../lib/format";
import { citationPage, engineLabel } from "../lib/labels";
import { usePageTitle } from "../shell/Page";
import styles from "./AskAiExportPage.module.css";
import { answerParts } from "./notice/steps/question/answerText";
import { readLine } from "./notice/steps/question/AnswerCard";
import { parseRulesAnswer, sourceTitle } from "./rules/rulesAnswer";

const RULES_SUBJECT = "Reglerna för offentlig upphandling";

/** "s. 5", "s. 6 (AI angav 5)" or "s. 5, hittades inte i underlaget", with the file when there are several. */
export function citationLine(citation: Citation, documents: readonly DocumentInfo[] = []): string {
  const page = citationPage(citation);
  let where = `s. ${page}`;
  if (citation.check === "moved") where = `s. ${page} (AI angav ${citation.page})`;
  if (citation.check === "unverified") where = `s. ${citation.page}, hittades inte i underlaget`;
  const document = documents.find((candidate) => candidate.id === citation.document_id);
  const name = document?.filename ?? citation.document;
  return name && documents.length > 1 ? `${where} · ${name}` : where;
}

/** "fråga 3 · besvarad 9 okt" for a quote of inköp's answer, or that it was not found among the answers (decision 0018). */
export function answerCitationLine(citation: AnswerCitation, answers: readonly PublishedAnswerView[]): string {
  const found = findPublishedAnswer(answers, citation.answer_key);
  if (citation.check === "unverified" || !found) return "hittades inte bland inköps svar";
  return `inköps svar i e-Avrop, ${answerMeta(found.number, found.entry).toLocaleLowerCase("sv")}`;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/u)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <Text as="p" key={index}>
            {paragraph}
          </Text>
        ))}
    </>
  );
}

function NoticeAnswer({
  view,
  documents,
  answers,
}: {
  view: AnswerView;
  documents: readonly DocumentInfo[];
  answers: readonly PublishedAnswerView[];
}) {
  const parts = answerParts(view.answer);
  const answerCitations = view.answer.answer_citations ?? [];
  const needsFormalQuestion = view.answer.suggest_formal_question || !view.answer.found_in_document;
  return (
    <VStack gap={2}>
      {parts.lead && (
        <Text as="p" weight="semibold">
          {parts.lead}
        </Text>
      )}
      {parts.paragraphs.map((paragraph, index) => (
        <Text as="p" key={index}>
          {paragraph}
        </Text>
      ))}
      {answerCitations.length > 0 && (
        <VStack gap={2}>
          <Text type="supporting">Inköp har svarat i e-Avrop:</Text>
          <VStack as="ul" role="list" gap={2}>
            {answerCitations.map((citation, index) => (
              <li key={index}>
                <Blockquote>{`”${citation.quote}” (${answerCitationLine(citation, answers)})`}</Blockquote>
              </li>
            ))}
          </VStack>
        </VStack>
      )}
      {view.answer.citations.length > 0 && (
        <VStack gap={2}>
          <Text type="supporting">Det här står i underlaget:</Text>
          <VStack as="ul" role="list" gap={2}>
            {view.answer.citations.map((citation, index) => (
              <li key={index}>
                <Blockquote>{`”${citation.quote}” (${citationLine(citation, documents)})`}</Blockquote>
              </li>
            ))}
          </VStack>
        </VStack>
      )}
      <Text type="supporting">{readLine(view.read)}</Text>
      {needsFormalQuestion && <Text type="supporting">{formalQuestionSentence(view.question_deadline)}</Text>}
    </VStack>
  );
}

function RulesAnswer({ view }: { view: RulesView }) {
  const parts = parseRulesAnswer(view.answer);
  return (
    <VStack gap={2}>
      {parts.lead && (
        <Text as="p" weight="semibold">
          {parts.lead}
        </Text>
      )}
      {parts.body && <Paragraphs text={parts.body} />}
      {view.answer.sources.length > 0 && (
        <VStack gap={2}>
          <Text type="supporting">{parts.sourcesIntro ?? "Svaret bygger på"}</Text>
          <VStack as="ul" role="list" gap={2}>
            {view.answer.sources.map((source, index) => (
              <li key={index}>
                <Text weight="semibold">{sourceTitle(source)}</Text>
                {source.note && <Text type="supporting">{source.note}</Text>}
                {source.excerpt && <Text>{source.excerpt}</Text>}
                {source.url && <Text type="supporting">{source.url}</Text>}
              </li>
            ))}
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}

function PrintedTurn({
  turn,
  number,
  documents,
  answers,
}: {
  turn: Turn;
  number: number;
  documents: readonly DocumentInfo[];
  answers: readonly PublishedAnswerView[];
}) {
  const engine = turn.answer?.engine ?? turn.rules?.engine ?? "";
  return (
    <VStack as="li" gap={3} className={styles.turn}>
      <Heading level={2}>{`Fråga ${number}`}</Heading>
      <Text weight="semibold">{turn.question}</Text>
      <Text type="supporting">{`Svar, ${engineLabel(engine)}, inte granskat av inköp`}</Text>
      {turn.answer && <NoticeAnswer view={turn.answer} documents={documents} answers={answers} />}
      {turn.rules && <RulesAnswer view={turn.rules} />}
    </VStack>
  );
}

function subjectOf(scope: AskScope | null, title: string | undefined): string {
  if (!scope) return "Inget samtal";
  return scope.kind === "notice" ? (title ?? "Upphandlingen") : RULES_SUBJECT;
}

/**
 * The conversation as a document (decision 0014), outside the frame: the browser prints it or saves it as PDF. The
 * subject, when it was made and that the answers are automatic and not reviewed; then each question with its answer,
 * the quotes with their pages (or the paragraphs of the law) and the line about the formal question. The conversation
 * comes from this tab's panel (`?amne=` names it), so nothing is sent anywhere.
 */
export default function AskAiExportPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ai = useAskAi();
  const scope = parseScopeKey(params.get("amne"));
  const turns = (scope ? (ai.conversations[scopeKey(scope)] ?? []) : []).filter(isAnswered);
  const notice = useNotice(scope?.kind === "notice" ? scope.noticeId : "");
  usePageTitle("Frågor och svar");
  const subject = subjectOf(scope, notice.data?.title);
  const applies = scope?.kind === "notice" ? "Det är alltid förfrågningsunderlaget som gäller." : "Det är alltid lagtexten som gäller.";
  return (
    <VStack gap={6} padding={6} hAlign="center">
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap" className={`${styles.paper} ${styles.toolbar}`}>
        <Button label="Tillbaka" variant="secondary" onClick={() => navigate(-1)} />
        <Button label="Skriv ut eller spara som PDF" variant="primary" onClick={() => window.print()} />
      </HStack>
      <VStack as="article" gap={6} className={styles.paper}>
        <VStack gap={2}>
          <Heading level={1}>Frågor och svar</Heading>
          <Text weight="semibold">{subject}</Text>
          <Text type="supporting">
            {`Från Anbudshjälpen ${formatDateTime(new Date().toISOString())}. Svaren är automatiskt framtagna och inte granskade av inköp. ${applies}`}
          </Text>
        </VStack>
        {turns.length === 0 ? (
          <Text>Det finns inga frågor och svar att skriva ut. Ställ en fråga i Fråga AI först.</Text>
        ) : (
          <VStack as="ol" role="list" gap={8} aria-label="Frågorna och svaren">
            {turns.map((turn, index) => (
              <PrintedTurn
                key={turn.id}
                turn={turn}
                number={index + 1}
                documents={notice.data?.documents ?? []}
                answers={notice.data?.published_answers ?? []}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}
