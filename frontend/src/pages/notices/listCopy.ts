/** The notice list's sentences, from the copy rules (direction.md, section 7). */
import type { NoticeSort } from "../../api/types";
import { formatNumber } from "../../lib/format";
import { SORT_CHOICES, type StatusChoice } from "./listState";

const NOUNS: Record<StatusChoice, readonly [one: string, many: string]> = {
  open: ["öppen upphandling", "öppna upphandlingar"],
  planned: ["planerad upphandling", "planerade upphandlingar"],
  all: ["upphandling", "upphandlingar"],
};

/** "12 öppna upphandlingar", "1 planerad upphandling", "168 upphandlingar". */
export function countText(total: number, status: StatusChoice): string {
  const [one, many] = NOUNS[status];
  return `${formatNumber(total)} ${total === 1 ? one : many}`;
}

export function sortPhrase(sort: NoticeSort): string {
  return SORT_CHOICES.find((choice) => choice.value === sort)?.phrase ?? "";
}

/**
 * The line above the list, read out when it changes: "12 öppna upphandlingar · närmast sista anbudsdag först", with
 * what narrows it ("från Timrå kommun", "verkar passa er", "matchar ”målning”").
 */
export function resultText({
  total,
  status,
  q,
  buyer = null,
  isFitOnly,
  sort,
}: {
  total: number;
  status: StatusChoice;
  q: string;
  buyer?: string | null;
  isFitOnly: boolean;
  sort: NoticeSort;
}): string {
  const search = q.trim();
  const conditions = [isFitOnly ? "verkar passa er" : null, search ? `matchar ”${search}”` : null].filter(Boolean);
  const count = [countText(total, status), buyer ? `från ${buyer}` : null, conditions.join(" och ")]
    .filter(Boolean)
    .join(" ");
  return total > 1 ? `${count} · ${sortPhrase(sort)}` : count;
}

/** "Visar 21–40 av 168". */
export function rangeText(page: number, pageSize: number, total: number): string {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `Visar ${formatNumber(first)}–${formatNumber(last)} av ${formatNumber(total)}`;
}
