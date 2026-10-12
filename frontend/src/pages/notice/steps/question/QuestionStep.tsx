import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import type { IsoDateTime, NoticeDetail } from "../../../../api/types";
import { calendarDateOf, formatLongDate, isPassed } from "../../../../lib/format";
import { StepLayout } from "../StepLayout";
import { Conversation } from "./Conversation";
import { PublishedAnswers } from "./PublishedAnswers";
import { QuestionRail } from "./QuestionRail";

/** The id of the step's heading, so a notice without steps can move the focus to it. */
export const QUESTION_HEADING_ID = "fraga-underlaget";

/** The step's lead: what the answers rest on, and where an open question goes (likabehandling). */
export function questionIntro(questionDeadline: IsoDateTime | null): string {
  const lead = "Svaren bygger bara på underlaget och visar var det står.";
  if (!questionDeadline) {
    return `${lead} Är något oklart? Ställ frågan i e-Avrop före sista dag för frågor, så får alla leverantörer samma svar.`;
  }
  const date = formatLongDate(calendarDateOf(questionDeadline), "auto");
  if (isPassed(questionDeadline)) return `${lead} Sista dag för frågor var ${date}.`;
  return `${lead} Är något oklart? Ställ frågan i e-Avrop senast ${date}, så får alla leverantörer samma svar.`;
}

/**
 * Step 2 Fråga (direction.md, section 4): questions answered from the document as a thread, with the rule for formal
 * questions beside it. `nextStep` ends the step ("Nästa steg") where the steps exist; a notice without a checklist
 * shows the questions alone.
 */
export function QuestionStep({ notice, nextStep }: { notice: NoticeDetail; nextStep?: ReactNode }) {
  if (!notice.has_documents) {
    return (
      <Card>
        <EmptyState
          headingLevel={2}
          title="Det finns inget underlag att fråga om ännu"
          description="När underlaget finns kan du ställa frågor om det här."
        />
      </Card>
    );
  }
  return (
    <StepLayout rail={<QuestionRail notice={notice} />} railLabel="Bra att veta om frågor">
      <VStack gap={2}>
        <Heading level={2} id={QUESTION_HEADING_ID} tabIndex={-1}>
          Fråga underlaget
        </Heading>
        <Text color="secondary">{questionIntro(notice.question_deadline)}</Text>
      </VStack>
      <PublishedAnswers notice={notice} />
      <Conversation notice={notice} />
      {nextStep}
    </StepLayout>
  );
}
