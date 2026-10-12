import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, useState } from "react";
import { useConfig } from "../../../../api/queries";
import type { Checklist, ChecklistView, NoticeDetail, UserView } from "../../../../api/types";
import { Attachments, ATTACHMENTS_ID } from "../../../../components/checklist/Attachments";
import {
  attachmentGroups,
  evaluationFigure,
  REQUIREMENT_SECTIONS,
  requirementSection,
  requirementsByKind,
  withoutEnginePrefix,
} from "../../../../components/checklist/checklistModel";
import { Evaluation, EVALUATION_ID } from "../../../../components/checklist/Evaluation";
import { KEY_DATES_ID, KeyDates } from "../../../../components/checklist/KeyDates";
import { OPEN_QUESTIONS_ID, OpenQuestions } from "../../../../components/checklist/OpenQuestions";
import { RequirementGroup } from "../../../../components/checklist/RequirementGroup";
import { Terms, TERMS_ID } from "../../../../components/checklist/Terms";
import { TermText } from "../../../../components/TermText";
import { AiProvenance } from "../../../../components/ui/AiProvenance";
import { ArrowRightIcon } from "../../../../components/ui/icons";
import { NextStepCard } from "../../../../components/ui/NextStepCard";
import { StatTile } from "../../../../components/ui/StatTile";
import { useStepNav } from "../../../../components/ui/StepNav";
import { formatLongDate } from "../../../../lib/format";
import { CHECKLIST_STATUS } from "../../../../lib/labels";
import { useIsPhone } from "../../../../lib/usePhone";
import { questionDeadlineDate, tenderDeadlineDate } from "../../noticeData";
import { StepLayout } from "../StepLayout";
import { RequirementsRail } from "./RequirementsRail";
import styles from "./RequirementsStep.module.css";
import { requirementsOutline, SUMMARY_ID, TASKS_ID, TASKS_TITLE } from "./requirementsOutline";

/** The step's section cards, which a tile, the outline or a link can name. */
const SECTION_IDS: ReadonlySet<string> = new Set([
  ...REQUIREMENT_SECTIONS.map((section) => section.id),
  ATTACHMENTS_ID,
  EVALUATION_ID,
  KEY_DATES_ID,
  TERMS_ID,
  OPEN_QUESTIONS_ID,
]);

/** Open from the start (direction.md, section 2): skallkrav, kvalificeringskrav and the dates before the tender. */
const OPEN_FROM_START = [...REQUIREMENT_SECTIONS.filter((section) => section.defaultOpen).map((section) => section.id), KEY_DATES_ID];

interface OpenSections {
  open: string[];
  onChange: (value: string | string[]) => void;
  /** Opens a section card the outline goes to; any other part of the step is left as it is. */
  reveal: (id: string) => void;
}

/**
 * Which section cards are open. A link to a section ("5 bilagor" → #bilagor) or to a row inside one (#krav-K12) opens
 * it through the section itself. The outline changes the address without the router, so it opens its section here.
 */
function useOpenSections(): OpenSections {
  const [open, setOpen] = useState<string[]>(OPEN_FROM_START);
  return {
    open,
    onChange: (value) => setOpen(Array.isArray(value) ? value : [value]),
    reveal: (id) => {
      if (SECTION_IDS.has(id)) setOpen((previous) => (previous.includes(id) ? previous : [...previous, id]));
    },
  };
}

/**
 * "11 skallkrav · 10 kvalificeringskrav · 5 bilagor · 70/30": each tile leads to its part of the step. A phone shows
 * the figure and the word only, two by two, as the phone design does.
 */
function TaskTiles({ checklist }: { checklist: Checklist }) {
  const isPhone = useIsPhone();
  const byKind = requirementsByKind(checklist.requirements);
  const attachments = attachmentGroups(checklist.attachments).required.length;
  const evaluation = evaluationFigure(checklist.evaluation);
  const helper = (text: string) => (isPhone ? undefined : text);
  return (
    <Grid columns={{ minWidth: 150, max: 4 }} gap={3}>
      {byKind.skallkrav.length > 0 && (
        <StatTile
          value={byKind.skallkrav.length}
          label="skallkrav"
          helper={helper("måste uppfyllas")}
          href={`#${requirementSection("skallkrav").id}`}
        />
      )}
      {byKind.kvalificeringskrav.length > 0 && (
        <StatTile
          value={byKind.kvalificeringskrav.length}
          label="kvalificeringskrav"
          helper={helper("krav på företaget")}
          href={`#${requirementSection("kvalificeringskrav").id}`}
        />
      )}
      {attachments > 0 && (
        <StatTile
          value={attachments}
          label={attachments === 1 ? "bilaga" : "bilagor"}
          helper={helper("att lämna med anbudet")}
          href={`#${ATTACHMENTS_ID}`}
        />
      )}
      {evaluation && (
        <StatTile value={evaluation.value} label={evaluation.label} helper={helper("så vinner man")} href={`#${EVALUATION_ID}`} />
      )}
    </Grid>
  );
}

/** For inköp only: the checklist on the notice page is not what companies see until it is published. */
function UnpublishedBanner({ view, user }: { view: ChecklistView; user: UserView | null }) {
  return (
    <Banner
      status="warning"
      title={`Inte publicerad: ${CHECKLIST_STATUS[view.status].toLocaleLowerCase("sv")}`}
      description="Företag ser checklistan först när inköp har granskat och publicerat den."
      collapsible={false}
      endContent={
        user?.role === "inkopare" ? <Button label="Granska checklistan" size="sm" href={`/inkop/checklistor/${view.id}`} /> : undefined
      }
    />
  );
}

function Summary({ checklist }: { checklist: Checklist }) {
  const headingId = useId();
  if (!checklist.summary.trim()) return null;
  return (
    <Card>
      <VStack as="section" id={SUMMARY_ID} aria-labelledby={headingId} gap={2} className={styles.anchor}>
        <Heading level={3} id={headingId}>
          Sammanfattning
        </Heading>
        <TermText text={withoutEnginePrefix(checklist.summary)} terms={checklist.terms} />
      </VStack>
    </Card>
  );
}

/**
 * Step 1 Krav (direction.md, section 4): who reviewed the list, once; what the reader has to do as tiles that lead to
 * their parts; the summary; then the groups with their counts, skallkrav and kvalificeringskrav open, the dates split
 * at sista anbudsdag, and the rest closed. Every row has its "s. 5". It ends with "Ställ en fråga".
 */
export function RequirementsStep({ notice, view, user }: { notice: NoticeDetail; view: ChecklistView; user: UserView | null }) {
  const { goTo } = useStepNav();
  const config = useConfig();
  const isPhone = useIsPhone();
  const tasksHeadingId = useId();
  const sections = useOpenSections();
  const { checklist, document_id: documentId } = view;
  const byKind = requirementsByKind(checklist.requirements);
  const isPublished = view.status === "published";
  const questionDeadline = questionDeadlineDate(notice);
  const organization = config.data?.organization_name;
  const groupProps = { noticeId: notice.id, documentId, terms: checklist.terms };
  // A phone says who reviewed in fewer words, so the line stays short above the tiles.
  const reviewedLabel = isPhone ? "Granskad av inköp" : `Granskad och publicerad av inköp${organization ? `, ${organization},` : ""}`;

  return (
    <StepLayout
      rail={
        <RequirementsRail items={requirementsOutline(checklist)} questionDeadline={questionDeadline} onNavigate={sections.reveal} />
      }
      railLabel="På den här sidan"
      isRailSticky
      narrowRail="hidden"
    >
      {!isPublished && <UnpublishedBanner view={view} user={user} />}
      <VStack gap={6}>
        <AiProvenance
          engine={view.engine}
          reviewedAt={isPublished && view.reviewed ? view.published_at : null}
          reviewedLabel={reviewedLabel}
          verification={view.verification}
          howLabel="Hur togs listan fram?"
        />
        <VStack as="section" id={TASKS_ID} aria-labelledby={tasksHeadingId} gap={3} className={styles.anchor}>
          <Heading level={2} id={tasksHeadingId}>
            {TASKS_TITLE}
          </Heading>
          <TaskTiles checklist={checklist} />
        </VStack>
      </VStack>
      <Summary checklist={checklist} />
      <CollapsibleGroup type="multiple" value={sections.open} onChange={sections.onChange}>
        {REQUIREMENT_SECTIONS.slice(0, 2).map((section) => (
          <RequirementGroup key={section.kind} section={section} requirements={byKind[section.kind]} {...groupProps} />
        ))}
        <Attachments attachments={checklist.attachments} noticeId={notice.id} documentId={documentId} />
        <Evaluation evaluation={checklist.evaluation} {...groupProps} />
        <KeyDates
          checklist={checklist}
          deadline={tenderDeadlineDate(notice)}
          noticeId={notice.id}
          documentId={documentId}
          canRemind={notice.status === "open" && isPublished}
        />
        {REQUIREMENT_SECTIONS.slice(2).map((section) => (
          <RequirementGroup key={section.kind} section={section} requirements={byKind[section.kind]} {...groupProps} />
        ))}
        <Terms terms={checklist.terms} noticeId={notice.id} documentId={documentId} />
        <OpenQuestions
          questions={checklist.open_questions}
          questionDeadline={questionDeadline ? formatLongDate(questionDeadline, "auto") : null}
        />
      </CollapsibleGroup>
      <NextStepCard
        text="Undrar du något om kraven? Ställ en fråga, så visar svaret var det står i underlaget."
        action={
          <Button label="Ställ en fråga" variant="primary" endContent={<Icon icon={ArrowRightIcon} />} onClick={() => goTo("fraga")} />
        }
      />
    </StepLayout>
  );
}
