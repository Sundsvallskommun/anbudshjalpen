import type { DateKind, IsoDate, NoticeDetail, ReminderKind } from "../../api/types";
import { swedishDate } from "../../lib/format";
import { keyDateIndex } from "../../lib/keyDates";

export type DeadlineKind = Exclude<ReminderKind, "egen">;

/** A key date from the notice's checklist as a calendar date ("YYYY-MM-DD"), or null when it has none. */
export function checklistDate(notice: NoticeDetail, kind: DateKind): IsoDate | null {
  const checklist = notice.checklist?.checklist;
  if (!checklist) return null;
  return checklist.dates[keyDateIndex(checklist, kind)]?.date ?? null;
}

/**
 * The date a reminder of this kind is for, by the backend's rule (services/reminders.deadline_for): the
 * published checklist's key date, and for sista anbudsdag the notice's own deadline when the checklist has
 * none. Null when the backend would refuse the reminder.
 */
export function reminderDeadline(notice: NoticeDetail, kind: DeadlineKind): IsoDate | null {
  const fromChecklist = notice.checklist?.status === "published" ? checklistDate(notice, kind) : null;
  if (fromChecklist) return fromChecklist;
  if (kind === "sista_anbudsdag" && notice.deadline_at) return swedishDate(notice.deadline_at);
  return null;
}

/** The document the checklist was made from, else the first one: checklist and fit citations cite its pages. */
export function primaryDocumentId(notice: NoticeDetail): string | undefined {
  return notice.checklist?.document_id ?? notice.documents[0]?.id;
}

/**
 * The document an answer cites when the answer does not name it (`AnswerView.document_id`): the notice's
 * first document (services/notices.first_document, the oldest), which may not be the checklist's.
 */
export function answerDocumentId(notice: NoticeDetail): string | undefined {
  return notice.documents[0]?.id;
}
