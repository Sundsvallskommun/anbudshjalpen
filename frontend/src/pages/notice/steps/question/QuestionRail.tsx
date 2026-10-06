import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { IsoDate, NoticeDetail } from "../../../../api/types";
import { DeadlineBlock } from "../../../../components/ui/DeadlineBlock";
import { ReminderState } from "../../../../components/ui/ReminderState";
import { formatShortDate } from "../../../../lib/format";
import { DocumentList } from "../../header/Documents";
import { publishedChecklist, questionDeadlineDate } from "../../noticeData";

const ANSWERS_BY = /\bsvar\w*\s+på\s+(?:de\s+)?frågor/iu;

/** The last day the municipality answers questions, when the published checklist names it ("Kommunen svarar senast"). */
export function answersByDate(notice: NoticeDetail): IsoDate | null {
  const checklist = publishedChecklist(notice)?.checklist;
  return checklist?.dates.find((date) => date.date && ANSWERS_BY.test(date.description))?.date ?? null;
}

/**
 * Step 2's rail (direction.md, section 4): how formal questions work, frågestopp with its reminder beside it and when
 * the answers come, each as a label over its date, and the document the answers are read from.
 */
export function QuestionRail({ notice }: { notice: NoticeDetail }) {
  const questionDate = questionDeadlineDate(notice);
  const answersBy = answersByDate(notice);
  return (
    <>
      <Card>
        <VStack gap={3}>
          <Heading level={3} accessibilityLevel={2}>
            Bra att veta
          </Heading>
          <Text>
            Frågor om underlaget ställs skriftligt i e-Avrop. Svaren publiceras där för alla som vill lämna anbud, så att
            alla får samma information.
          </Text>
          {notice.question_deadline && (
            <>
              <Divider />
              <VStack gap={2} hAlign="start">
                <VStack gap={0.5}>
                  <Text type="supporting">Sista dag för frågor</Text>
                  <DeadlineBlock deadline={notice.question_deadline} variant="inline" />
                </VStack>
                {questionDate && notice.status === "open" && (
                  <ReminderState noticeId={notice.id} kind="fragestopp" deadline={questionDate} subject="sista dag för frågor" />
                )}
              </VStack>
            </>
          )}
          {answersBy && (
            <>
              <Divider />
              <VStack gap={0.5}>
                <Text type="supporting">Kommunen svarar senast</Text>
                <Text weight="semibold">{formatShortDate(answersBy)}</Text>
              </VStack>
            </>
          )}
        </VStack>
      </Card>
      {notice.documents.length > 0 && (
        <Card>
          <VStack gap={3}>
            <Heading level={3} accessibilityLevel={2}>
              Underlaget
            </Heading>
            <DocumentList notice={notice} />
          </VStack>
        </Card>
      )}
    </>
  );
}
