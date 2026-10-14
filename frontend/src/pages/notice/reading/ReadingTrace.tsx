import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useReadingReport } from "../../../api/queries";
import type { NoticeDetail } from "../../../api/types";
import { ErrorNotice, Loading } from "../../../components/states";
import { useIsPhone } from "../../../lib/usePhone";
import { readingGroups, stepTime, type ReadingGroup, type ReadingStep } from "./readingSteps";

export const READING_TITLE = "Så lästes underlaget";
export const READING_INTRO =
  "Varje steg kommer från det som redan sparas om filerna; inget läggs till i efterhand. Tiderna är svensk tid.";

function StepTime({ at }: { at: string }) {
  return (
    <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
      {stepTime(at)}
    </Text>
  );
}

/**
 * One step: when, a mark for what the AI never saw or a check that passed, and what happened. Wide screens keep the
 * times in a column of their own, so the eye runs down them; a phone puts the time under the text instead.
 */
function Step({ step }: { step: ReadingStep }) {
  const isPhone = useIsPhone();
  const what = (
    <HStack gap={1.5} vAlign="start">
      {step.tone === "warning" && <Icon icon="warning" size="sm" color="warning" />}
      {step.tone === "good" && <Icon icon="check" size="sm" color="success" />}
      <Text>{step.text}</Text>
    </HStack>
  );
  if (isPhone) {
    return (
      <VStack as="li" gap={0.5} hAlign="start">
        {what}
        {step.at && <StepTime at={step.at} />}
      </VStack>
    );
  }
  return (
    <HStack as="li" gap={3} vAlign="start">
      <VStack width={112} hAlign="start">{step.at && <StepTime at={step.at} />}</VStack>
      {what}
    </HStack>
  );
}

function Group({ group }: { group: ReadingGroup }) {
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text weight="semibold">{group.title}</Text>
        {group.marks.map((mark) => (
          <Token key={mark} label={mark} color="gray" size="sm" />
        ))}
      </HStack>
      <VStack as="ol" role="list" aria-label={`Steg för ${group.title}`} gap={1}>
        {group.steps.map((step, index) => (
          <Step key={index} step={step} />
        ))}
      </VStack>
    </VStack>
  );
}

/**
 * The demo's trace of what happened to the notice's files, step by step: fetched or uploaded, the text taken out,
 * an e-Avrop export recognised, pages without text, replaced versions, files that were not read, and the checklist's
 * way from interpretation to publication. Shown behind "Så lästes underlaget" while the switch in "Om demon och AI"
 * is on. Every step is read off what the app already stores (`GET /api/notices/{id}/reading` and the notice itself).
 */
export function ReadingTrace({ notice }: { notice: NoticeDetail }) {
  const report = useReadingReport(notice.id);
  if (report.isPending) return <Loading label="Hämtar hur underlaget lästes …" />;
  if (report.isError) {
    return <ErrorNotice title="Det gick inte att hämta hur underlaget lästes" error={report.error} onRetry={() => report.refetch()} />;
  }
  return (
    <VStack gap={5}>
      <Text as="p" type="supporting">
        {READING_INTRO}
      </Text>
      {readingGroups(report.data, notice).map((group) => (
        <Group key={group.key} group={group} />
      ))}
    </VStack>
  );
}
