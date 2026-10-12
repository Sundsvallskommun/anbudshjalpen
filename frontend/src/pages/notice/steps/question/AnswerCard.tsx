import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useId } from "react";
import type { AnswerCitation, AnswerView, Citation, NoticeDetail, ReadSummary } from "../../../../api/types";
import { FormalQuestionAdvice } from "../../../../components/FormalQuestionAdvice";
import { AiProvenance } from "../../../../components/ui/AiProvenance";
import { PublishedAnswerQuote } from "../../../../components/ui/PublishedAnswerQuote";
import { SourceLink } from "../../../../components/ui/source/SourceLink";
import { calendarDateOf, formatShortDate, isPassed } from "../../../../lib/format";
import { formalQuestionLink, procurementLink } from "../../../../lib/links";
import { answerDocumentId } from "../../noticeData";
import { answerParts, QUOTES_LEAD, quoteClaim } from "./answerText";

function Quotes({
  citations,
  notice,
  documentId,
  question,
}: {
  citations: readonly Citation[];
  notice: NoticeDetail;
  documentId?: string;
  question: string;
}) {
  const labelId = useId();
  return (
    <VStack gap={2}>
      <Text type="supporting" id={labelId}>
        {QUOTES_LEAD}
      </Text>
      <VStack as="ul" role="list" aria-labelledby={labelId} gap={3}>
        {citations.map((citation, index) => (
          <li key={index}>
            <VStack gap={1}>
              <Blockquote>{citation.quote}</Blockquote>
              {/* "Källa: 6.6 Krav på Entreprenör.pdf, s. 8": the link names the file from the notice's documents. */}
              <Text type="supporting">
                Källa:{" "}
                <SourceLink
                  noticeId={notice.id}
                  citation={citation}
                  claim={quoteClaim(citation.quote)}
                  origin={`Svar på ”${question}”`}
                  documentId={citation.document_id ?? documentId}
                  isInline
                />
              </Text>
            </VStack>
          </li>
        ))}
      </VStack>
    </VStack>
  );
}

/** Inköp's own answers in e-Avrop that the answer rests on (decision 0018): before the document's quotes, as they go first. */
function AnswerQuotes({ citations, notice }: { citations: readonly AnswerCitation[]; notice: NoticeDetail }) {
  const labelId = useId();
  return (
    <VStack gap={2}>
      <Text type="supporting" id={labelId}>
        Inköp har svarat i e-Avrop:
      </Text>
      <VStack as="ul" role="list" aria-labelledby={labelId} gap={3}>
        {citations.map((citation, index) => (
          <li key={index}>
            <PublishedAnswerQuote citation={citation} answers={notice.published_answers} noticeId={notice.id} />
          </li>
        ))}
      </VStack>
    </VStack>
  );
}

/** What the engine read (decision 0012): all of it, or how much of the procurement's documents. */
export function readLine(read: ReadSummary): string {
  const whole = read.pages_read === read.pages_total;
  if (read.documents_total <= 1) {
    return whole ? "Svaret bygger på hela underlaget." : `Svaret bygger på ${read.pages_read} av ${read.pages_total} sidor i underlaget.`;
  }
  return whole
    ? `Svaret bygger på alla ${read.documents_total} dokument i underlaget.`
    : `Svaret bygger på ${read.pages_read} av ${read.pages_total} sidor i underlagets ${read.documents_total} dokument.`;
}

/** "Oklart? Ställ frågan i e-Avrop senast 30 okt.", for an answer the document settles. */
function ShortAdvice({ questionDeadline }: { questionDeadline: string | null }) {
  if (questionDeadline && isPassed(questionDeadline)) return null;
  const when = questionDeadline ? `senast ${formatShortDate(calendarDateOf(questionDeadline))}` : "före sista dag för frågor";
  return <Text type="supporting">{`Oklart? Ställ frågan i e-Avrop ${when}.`}</Text>;
}

/**
 * An answer in the thread (direction.md, section 4 "Steg 2 Fråga"): the provenance line, "Inköp har svarat" when it
 * rests on inköp's published answer (decision 0018) or else "Står i underlaget" when a quote was found, the lead
 * sentence in bold, inköp's answers, each quote with its page, and the line about equal treatment: the whole
 * advice with the date and the reminder when the document does not settle the question.
 */
export function AnswerCard({ view, question, notice }: { view: AnswerView; question: string; notice: NoticeDetail }) {
  const { answer, engine, question_deadline: questionDeadline } = view;
  // The backend says which document it read; without that, it read the first one.
  const documentId: string | undefined = view.document_id ?? answerDocumentId(notice);
  const parts = answerParts(answer);
  // An answer stored in the browser before decision 0018 has no quotes of inköp's answers.
  const answerCitations = answer.answer_citations ?? [];
  // Only an answer that says it is settled gets the green token: never beside the advice to ask formally.
  const isAnsweredByBuyer = answer.found_in_document && answerCitations.some((citation) => citation.check !== "unverified");
  const isBacked = answer.found_in_document && answer.citations.some((citation) => citation.check !== "unverified");
  const needsFormalQuestion = answer.suggest_formal_question || !answer.found_in_document;
  // A made-up notice with no page of its own is in no e-Avrop: the advice says so instead of linking there.
  const isMadeUp = notice.is_fictitious && !procurementLink(notice);
  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="supporting" weight="semibold" color="primary">
              Svar
            </Text>
            <AiProvenance engine={engine} />
          </HStack>
          {isAnsweredByBuyer ? (
            <Token label="Inköp har svarat" color="green" size="sm" icon={<Icon icon="success" size="sm" />} />
          ) : (
            isBacked && <Token label="Står i underlaget" color="green" size="sm" icon={<Icon icon="success" size="sm" />} />
          )}
        </HStack>
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
        {answerCitations.length > 0 && <AnswerQuotes citations={answerCitations} notice={notice} />}
        {answer.citations.length > 0 && (
          <Quotes citations={answer.citations} notice={notice} documentId={documentId} question={question} />
        )}
        <Text type="supporting">{readLine(view.read)}</Text>
        {needsFormalQuestion ? (
          <FormalQuestionAdvice
            noticeId={notice.id}
            questionDeadline={questionDeadline}
            link={isMadeUp ? null : formalQuestionLink(notice, view.formal_question_url)}
            isFictitiousWithoutPage={isMadeUp}
          />
        ) : (
          <ShortAdvice questionDeadline={questionDeadline} />
        )}
      </VStack>
    </Card>
  );
}
