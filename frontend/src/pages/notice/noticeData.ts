/**
 * What the notice page derives from a notice: the deadlines the backend reminds about, the documents citations refer
 * to, and the facts of the header in the reader's words. Pure functions, tested without rendering.
 */
import type { ChecklistView, DateKind, IsoDate, NoticeDetail, ReminderKind } from "../../api/types";
import { calendarDateOf, swedishDate } from "../../lib/format";
import { keyDateIndex } from "../../lib/keyDates";
import { noticeDeadlineReminder, sourceLabel } from "../../lib/labels";
import { splitTitleAndBody } from "../../lib/text";

export { primaryDocumentId } from "../../components/ui/source/sourceTarget";

export type DeadlineKind = Exclude<ReminderKind, "egen">;

/** The checklist companies may rely on: published by inköp. A buyer also sees drafts, which are not this. */
export function publishedChecklist(notice: Pick<NoticeDetail, "checklist">): ChecklistView | null {
  return notice.checklist?.status === "published" ? notice.checklist : null;
}

/** A key date from the notice's checklist as a calendar date ("YYYY-MM-DD"), or null when it has none. */
export function checklistDate(notice: NoticeDetail, kind: DateKind): IsoDate | null {
  const checklist = notice.checklist?.checklist;
  if (!checklist) return null;
  return checklist.dates[keyDateIndex(checklist, kind)]?.date ?? null;
}

/**
 * The date a reminder of this kind is for, by the backend's rule (services/reminders.reminder_deadline): the
 * published checklist's key date, and the notice's own deadline for the reminder that follows it (sista anbudsdag, or
 * anbudsansökan in a restricted procedure, which no checklist names). Null when the backend would refuse the reminder.
 */
export function reminderDeadline(notice: NoticeDetail, kind: DeadlineKind): IsoDate | null {
  const own = kind === noticeDeadlineReminder(notice) && notice.deadline_at ? swedishDate(notice.deadline_at) : null;
  if (kind === "anbudsansokan") return own;
  const fromChecklist = publishedChecklist(notice) ? checklistDate(notice, kind) : null;
  return fromChecklist ?? own;
}

/**
 * The calendar date of sista anbudsdag, where the key dates split into before and after the tender. A restricted
 * procedure's notice only gives the last day for anbudsansökan, so its sista anbudsdag comes from the checklist.
 */
export function tenderDeadlineDate(notice: NoticeDetail): IsoDate | null {
  if (notice.deadline_at && notice.deadline_kind !== "request") return swedishDate(notice.deadline_at);
  return checklistDate(notice, "sista_anbudsdag");
}

/** Frågestopp as a calendar date: the published checklist's, which the backend sends as the end of that day. */
export function questionDeadlineDate(notice: Pick<NoticeDetail, "question_deadline">): IsoDate | null {
  return notice.question_deadline ? calendarDateOf(notice.question_deadline) : null;
}

/**
 * The document an answer cites when the answer does not name it (`AnswerView.document_id`): the notice's
 * first document (services/notices.first_document, the oldest), which may not be the checklist's.
 */
export function answerDocumentId(notice: NoticeDetail): string | undefined {
  return notice.documents[0]?.id;
}

/**
 * Who buys and the reference people quote for the procurement (direction.md, section 4): "Sundsvalls kommun ·
 * DEMO-2026-0147". A real notice also says where it comes from: "Mitthem AB · TED".
 */
export function noticeMeta(notice: Pick<NoticeDetail, "buyer" | "reference_number" | "source">): string {
  // Made-up notices carry the "Fiktiv" token; "Demo" as their source would say the same twice.
  const source = notice.source === "fixture" ? null : sourceLabel(notice.source);
  return [notice.buyer, notice.reference_number?.trim(), source].filter(Boolean).join(" · ");
}

/**
 * The titles of the requirements step 1 lists, by id, as their rows show them (a body that only repeats the title is
 * left out): what a fit reason about a requirement links to.
 */
export function requirementTitles(notice: Pick<NoticeDetail, "checklist">): Map<string, string> {
  const requirements = notice.checklist?.checklist.requirements ?? [];
  return new Map(requirements.map((requirement) => [requirement.id, splitTitleAndBody(requirement.title, requirement.plain_language).title]));
}

/** What is bought, as the CPV list names it: "Målning · Målning av byggnader". Codes it does not name are left out. */
export function cpvNames(notice: Pick<NoticeDetail, "cpv_codes" | "cpv_labels">): string[] {
  const labels = notice.cpv_labels ?? {};
  return [...new Set(notice.cpv_codes.map((code) => labels[code]?.trim()).filter((label): label is string => Boolean(label)))];
}

export interface ProcedureFact {
  /** In plain words, with a term the glossary explains: "Under EU:s beloppsgränser". */
  label: string;
  /** The law and what else the notice says: "19 kap. LOU", "6 kap. 2 § LOU · ramavtal med en leverantör". */
  detail: string | null;
}

const BELOW_THRESHOLDS = /tröskelvärde|19\s*kap/iu;
const WITH_REFERENCE = /^(.*?)\s*\(([^)]*)\)\s*(?:,\s*(.*))?$/u;

/**
 * The procedure as a key fact (direction.md, section 7): "Annonserad upphandling under tröskelvärdena enligt 19 kap.
 * LOU" reads "Under EU:s beloppsgränser" with "19 kap. LOU" below; "Öppet förfarande (6 kap. 2 § LOU)" keeps its
 * name and puts the law below.
 */
export function procedureFact(procedure: string | null): ProcedureFact | null {
  const text = procedure?.trim();
  if (!text) return null;
  if (BELOW_THRESHOLDS.test(text)) return { label: "Under EU:s beloppsgränser", detail: "19 kap. LOU" };
  const match = WITH_REFERENCE.exec(text);
  if (match?.[1]) {
    const detail = [match[2], match[3]].map((part) => part?.trim()).filter(Boolean).join(" · ");
    return { label: match[1].trim(), detail: detail || null };
  }
  return { label: text, detail: null };
}
