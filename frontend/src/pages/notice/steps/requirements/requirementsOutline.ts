/**
 * The parts of step 1 in page order, for the outline in the rail ("På den här sidan") and the statistic tiles. Each
 * id is the anchor of a part on the page; a part the checklist does not have is left out.
 */
import type { OutlineItem } from "@astryxdesign/core/Outline";
import type { Checklist } from "../../../../api/types";
import { ATTACHMENTS_ID } from "../../../../components/checklist/Attachments";
import { attachmentGroups, REQUIREMENT_SECTIONS, requirementsByKind } from "../../../../components/checklist/checklistModel";
import { EVALUATION_ID } from "../../../../components/checklist/Evaluation";
import { KEY_DATES_ID } from "../../../../components/checklist/KeyDates";
import { OPEN_QUESTIONS_ID, OPEN_QUESTIONS_TITLE } from "../../../../components/checklist/OpenQuestions";
import { TERMS_ID, TERMS_TITLE } from "../../../../components/checklist/Terms";

export const TASKS_ID = "att-gora";
export const TASKS_TITLE = "Det här behöver du göra";
export const SUMMARY_ID = "sammanfattning";

function item(id: string, label: string): OutlineItem {
  return { id, label, level: 2 };
}

export function requirementsOutline(checklist: Checklist): OutlineItem[] {
  const byKind = requirementsByKind(checklist.requirements);
  const sections = REQUIREMENT_SECTIONS.map((section) => ({ section, count: byKind[section.kind].length }));
  const [early, late] = [sections.slice(0, 2), sections.slice(2)];
  const attachments = attachmentGroups(checklist.attachments).required.length;
  return [
    item(TASKS_ID, TASKS_TITLE),
    ...(checklist.summary.trim() ? [item(SUMMARY_ID, "Sammanfattning")] : []),
    ...early.filter(({ count }) => count > 0).map(({ section, count }) => item(section.id, `${section.title} (${count})`)),
    ...(checklist.attachments.length > 0 ? [item(ATTACHMENTS_ID, `Bilagor (${attachments})`)] : []),
    ...(checklist.evaluation.length > 0 ? [item(EVALUATION_ID, "Utvärdering")] : []),
    ...(checklist.dates.length > 0 ? [item(KEY_DATES_ID, "Viktiga datum")] : []),
    ...late.filter(({ count }) => count > 0).map(({ section, count }) => item(section.id, `${section.title} (${count})`)),
    ...(checklist.terms.length > 0 ? [item(TERMS_ID, TERMS_TITLE)] : []),
    ...(checklist.open_questions.length > 0 ? [item(OPEN_QUESTIONS_ID, OPEN_QUESTIONS_TITLE)] : []),
  ];
}
