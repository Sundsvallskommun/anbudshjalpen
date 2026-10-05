import type { Checklist, DateKind } from "../api/types";

/**
 * The index of a checklist's key date of a kind: its first dated entry, or -1. This is the backend's rule
 * (services/checklists.key_date), so the app shows a deadline and reminds about the same entry.
 */
export function keyDateIndex(checklist: Checklist, kind: DateKind): number {
  return checklist.dates.findIndex((date) => date.kind === kind && date.date);
}
