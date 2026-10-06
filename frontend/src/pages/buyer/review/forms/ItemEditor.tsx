import type { RowItem } from "../rows";
import { ITEM_NOUN } from "../rows";
import {
  AttachmentForm,
  DateForm,
  EvaluationForm,
  QuestionForm,
  RequirementForm,
  SummaryForm,
  TermForm,
} from "./ItemForms";

/** What the buyer is editing: an item of the checklist (new or existing), or the summary. */
export type EditTarget =
  | { mode: "edit"; key: string; index: number; item: RowItem }
  | { mode: "add"; item: RowItem }
  | { mode: "summary"; summary: string };

/** The editor's heading and name: "Ändra kravet", "Nytt datum", "Ändra sammanfattningen". */
export function editTitle(target: EditTarget): string {
  if (target.mode === "summary") return "Ändra sammanfattningen";
  const noun = ITEM_NOUN[target.item.section];
  return target.mode === "add" ? noun.new : noun.change;
}

/** A stable identity for the form, so switching to another item starts a fresh form. */
export function editKey(target: EditTarget): string {
  if (target.mode === "summary") return "sammanfattning";
  if (target.mode === "add") return `ny:${target.item.section}`;
  return `andra:${target.key}`;
}

export interface ItemEditorProps {
  target: EditTarget;
  isInPane: boolean;
  pageCount?: number;
  onSaveItem: (item: RowItem) => void;
  onSaveSummary: (summary: string) => void;
  onCancel: () => void;
}

/** The form for what is being edited. */
export function ItemEditor({ target, isInPane, pageCount, onSaveItem, onSaveSummary, onCancel }: ItemEditorProps) {
  const label = editTitle(target);
  const common = { label, isInPane, pageCount, onCancel, isNew: target.mode === "add" };
  if (target.mode === "summary") {
    return <SummaryForm {...common} initial={target.summary} onSave={onSaveSummary} />;
  }
  const { item } = target;
  switch (item.section) {
    case "requirement":
      return (
        <RequirementForm {...common} initial={item.value} onSave={(value) => onSaveItem({ section: "requirement", value })} />
      );
    case "date":
      return <DateForm {...common} initial={item.value} onSave={(value) => onSaveItem({ section: "date", value })} />;
    case "attachment":
      return (
        <AttachmentForm {...common} initial={item.value} onSave={(value) => onSaveItem({ section: "attachment", value })} />
      );
    case "evaluation":
      return (
        <EvaluationForm {...common} initial={item.value} onSave={(value) => onSaveItem({ section: "evaluation", value })} />
      );
    case "term":
      return <TermForm {...common} initial={item.value} onSave={(value) => onSaveItem({ section: "term", value })} />;
    case "question":
      return <QuestionForm {...common} initial={item.value} onSave={(value) => onSaveItem({ section: "question", value })} />;
  }
}
