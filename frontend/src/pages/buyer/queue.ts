/**
 * The review queue's rules (direction.md, section 4 "Inköp: Att granska"), as pure functions so they are tested
 * without rendering: which checklists each view lists, which drafts a newer interpretation has replaced, and how the
 * sources held up.
 */
import type { ChecklistAdminItem, ChecklistStatus, VerificationSummary } from "../../api/types";

/** The queue's views: what inköp has to act on (drafts and approved ones), the published, the rejected, and all. */
export type QueueView = "hantera" | "publicerade" | "avvisade" | "alla";

export const QUEUE_VIEWS: readonly { value: QueueView; label: string }[] = [
  { value: "hantera", label: "Att hantera" },
  { value: "publicerade", label: "Publicerade" },
  { value: "avvisade", label: "Avvisade" },
  { value: "alla", label: "Alla" },
];

/**
 * Whether inköp has to act on a checklist: a draft to review, or an approved one not yet published. Approved ones are
 * listed with the drafts so that nothing stops between approval and publication.
 */
export function needsHandling(status: ChecklistStatus): boolean {
  return status === "draft" || status === "approved";
}

/** Whether a view lists the checklist. */
export function isInView(item: Pick<ChecklistAdminItem, "status">, view: QueueView): boolean {
  if (view === "hantera") return needsHandling(item.status);
  if (view === "publicerade") return item.status === "published";
  if (view === "avvisade") return item.status === "rejected";
  return true;
}

/** The checklists a view lists, in the backend's order (soonest sista anbudsdag first). */
export function itemsInView<T extends Pick<ChecklistAdminItem, "status">>(items: readonly T[], view: QueueView): T[] {
  return items.filter((item) => isInView(item, view));
}

/**
 * The checklists a newer interpretation of the same notice has replaced: a draft or an approved checklist when the
 * notice has a newer one that is not rejected ("Ersatt av nyare tolkning"). A rejected newer one replaces nothing,
 * since it will not be published.
 */
export function supersededIds(
  items: readonly Pick<ChecklistAdminItem, "id" | "notice_id" | "status" | "created_at">[],
): ReadonlySet<string> {
  const superseded = new Set<string>();
  for (const item of items) {
    if (!needsHandling(item.status)) continue;
    const created = Date.parse(item.created_at);
    const replaced = items.some(
      (other) =>
        other.id !== item.id &&
        other.notice_id === item.notice_id &&
        other.status !== "rejected" &&
        Date.parse(other.created_at) > created,
    );
    if (replaced) superseded.add(item.id);
  }
  return superseded;
}

export interface SourceCounts {
  /** Quotes found in the document, on the page the AI gave or on another one. */
  found: number;
  total: number;
  /** Quotes the buyer should look at: not found, or found on another page than the AI gave. */
  toCheck: number;
}

/** How a checklist's sources held up: "41/41", or "3 att kontrollera". */
export function sourceCounts(summary: VerificationSummary): SourceCounts {
  return {
    found: summary.citations_verified + summary.citations_moved,
    total: summary.citations_total,
    toCheck: summary.citations_unverified + summary.citations_moved,
  };
}

/** The next checklist to review after the one just handled: the first one in the queue still to act on. */
export function nextToHandle<T extends Pick<ChecklistAdminItem, "id" | "status">>(
  items: readonly T[],
  currentId: string,
): { next: T | null; remaining: number } {
  const rest = items.filter((item) => item.id !== currentId && needsHandling(item.status));
  return { next: rest[0] ?? null, remaining: rest.length };
}
