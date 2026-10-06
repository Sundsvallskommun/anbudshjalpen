import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useId } from "react";
import type { AnswerView, Citation, NoticeDetail } from "../../../../api/types";
import { FormalQuestionAdvice } from "../../../../components/FormalQuestionAdvice";
import { AiProvenance } from "../../../../components/ui/AiProvenance";
import { SourceLink } from "../../../../components/ui/source/SourceLink";
import { calendarDateOf, formatShortDate, isPassed } from "../../../../lib/format";
import { formalQuestionLink, procurementLink } from "../../../../lib/links";
import { answerDocumentId } from "../../noticeData";
import { answerParts, QUOTES_LEAD, quoteClaim } from "./answerText";

function Quotes({
  citations,
  noticeId,
  documentId,
  question,
}: {
  citations: readonly Citation[];
  noticeId: string;
  documentId?: string;
  question: string;
}) {
  const labelId = useId();
  return (
    <VStack gap={2}>
      <Text type="supporting" id={labelId}>
        {QUOTES_LEAD}
      </Text>
      <VStack as="ul" role="list" aria-labelledby={labelId} gap={2}>
        {citations.map((citation, index) => (
          <li key={index}>
            <Blockquote>
              {citation.quote}{" "}
              <SourceLink
                noticeId={noticeId}
                citation={citation}
                claim={quoteClaim(citation.quote)}
                origin={`Svar på ”${question}”`}
                documentId={documentId}
                isInline
              />
            </Blockquote>
          </li>
        ))}
      </VStack>
    </VStack>
  );
}

/** "Oklart? Ställ frågan i e-Avrop senast 30 okt.", for an answer the document settles. */
function ShortAdvice({ questionDeadline }: { questionDeadline: string | null }) {
  if (questionDeadline && isPassed(questionDeadline)) return null;
  const when = questionDeadline ? `senast ${formatShortDate(calendarDateOf(questionDeadline))}` : "före sista dag för frågor";
  return <Text type="supporting">{`Oklart? Ställ frågan i e-Avrop ${when}.`}</Text>;
}

/**
 * An answer in the thread (direction.md, section 4 "Steg 2 Fråga"): the provenance line, "Står i underlaget" when a
 * quote was found, the lead sentence in bold, each quote with its page, and the line about equal treatment: the whole
 * advice with the date and the reminder when the document does not settle the question.
 */
export function AnswerCard({ view, question, notice }: { view: AnswerView; question: string; notice: NoticeDetail }) {
  const { answer, engine, question_deadline: questionDeadline } = view;
  // The backend says which document it read; without that, it read the first one.
  const documentId: string | undefined = view.document_id ?? answerDocumentId(notice);
  const parts = answerParts(answer);
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
          {isBacked && <Token label="Står i underlaget" color="green" size="sm" icon={<Icon icon="success" size="sm" />} />}
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
        {answer.citations.length > 0 && (
          <Quotes citations={answer.citations} noticeId={notice.id} documentId={documentId} question={question} />
        )}
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
