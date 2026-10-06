/**
 * The notice list's state lives in the address, so a search can be shared, bookmarked and reloaded:
 * `?q=` the search text, `?status=planned|alla` (Öppna is the default and has no parameter), `?kalla=` the source,
 * `?kopare=` a buyer, `?passar=1` only what fits the company's profile, `?sortera=frist|publicerad|relevans` and
 * `?sida=` the page.
 */
import { useSearchParams } from "react-router";
import type { BuyerFilters, NoticeFilters } from "../../api/queries";
import type { NoticeCounts, NoticeList, NoticeSort } from "../../api/types";

export const PAGE_SIZE = 20;

export type StatusChoice = keyof NoticeCounts;

export const STATUS_CHOICES: readonly { value: StatusChoice; label: string }[] = [
  { value: "open", label: "Öppna" },
  { value: "planned", label: "Planerade" },
  { value: "all", label: "Alla" },
];

export const SOURCES = [
  { value: "eavrop", label: "e-Avrop" },
  { value: "ted", label: "TED" },
  { value: "fixture", label: "Demo" },
  { value: "manual", label: "Inlagd av inköp" },
] as const;

export type SourceChoice = (typeof SOURCES)[number]["value"];

export const SORT_CHOICES: readonly { value: NoticeSort; label: string; phrase: string }[] = [
  { value: "deadline", label: "Sista anbudsdag", phrase: "närmast sista anbudsdag först" },
  { value: "published", label: "Senast publicerad", phrase: "senast publicerade först" },
  { value: "relevance", label: "Bäst träff", phrase: "bäst träff först" },
];

export interface ListState {
  q: string;
  status: StatusChoice;
  source: SourceChoice | null;
  /** A buyer from "Fler filter" ("Timrå kommun"): the list keeps the notices whose buyer contains it. */
  buyer: string | null;
  /** "Visa bara det som passar er": the company profile's CPV codes as a filter. */
  isFitOnly: boolean;
  /** The order the reader chose; null for the backend's default. */
  sort: NoticeSort | null;
  page: number;
}

const PARAM = {
  q: "q",
  status: "status",
  source: "kalla",
  buyer: "kopare",
  fit: "passar",
  sort: "sortera",
  page: "sida",
} as const;

const STATUS_PARAM: Record<StatusChoice, string | null> = { open: null, planned: "planned", all: "alla" };
const SORT_PARAM: Record<NoticeSort, string> = { deadline: "frist", published: "publicerad", relevance: "relevans" };

/**
 * No parameter is Öppna. "open" is what older links and the home redirect carry; the closed and awarded choices the
 * list used to have are part of Alla now.
 */
export function parseStatus(value: string | null): StatusChoice {
  if (value === null || value === "open") return "open";
  if (value === "planned") return "planned";
  return "all";
}

function parseSort(value: string | null): NoticeSort | null {
  const entry = Object.entries(SORT_PARAM).find(([, param]) => param === value);
  return entry ? (entry[0] as NoticeSort) : null;
}

function parseSource(value: string | null): SourceChoice | null {
  return SOURCES.find((source) => source.value === value)?.value ?? null;
}

export function parseListState(params: URLSearchParams): ListState {
  return {
    q: params.get(PARAM.q) ?? "",
    status: parseStatus(params.get(PARAM.status)),
    source: parseSource(params.get(PARAM.source)),
    buyer: params.get(PARAM.buyer)?.trim() || null,
    isFitOnly: params.get(PARAM.fit) === "1",
    sort: parseSort(params.get(PARAM.sort)),
    page: Math.max(1, Number.parseInt(params.get(PARAM.page) ?? "1", 10) || 1),
  };
}

/** The address parameters for a change; any change but the page itself starts again on page 1. */
export function applyChanges(current: URLSearchParams, changes: Partial<ListState>): URLSearchParams {
  const next = new URLSearchParams(current);
  const put = (name: string, value: string | null) => {
    if (value) next.set(name, value);
    else next.delete(name);
  };
  if (changes.q !== undefined) put(PARAM.q, changes.q.trim());
  if (changes.status !== undefined) put(PARAM.status, STATUS_PARAM[changes.status]);
  if (changes.source !== undefined) put(PARAM.source, changes.source);
  if (changes.buyer !== undefined) put(PARAM.buyer, changes.buyer?.trim() || null);
  if (changes.isFitOnly !== undefined) put(PARAM.fit, changes.isFitOnly ? "1" : null);
  if (changes.sort !== undefined) put(PARAM.sort, changes.sort ? SORT_PARAM[changes.sort] : null);
  put(PARAM.page, changes.page && changes.page > 1 ? String(changes.page) : null);
  return next;
}

/** The order the backend applies when none is asked for (NoticeList.sort): open notices by deadline. */
export function defaultSort(status: StatusChoice, q: string): NoticeSort {
  if (status === "open") return "deadline";
  return q.trim() ? "relevance" : "published";
}

/** The order the list is in: what the backend says it used, else what the reader asked for, else the default. */
export function currentSort(state: ListState, data: Pick<NoticeList, "sort"> | undefined): NoticeSort {
  return data?.sort ?? state.sort ?? defaultSort(state.status, state.q);
}

/** The orders to offer: "Bäst träff" means something only with a search text. */
export function sortChoices(q: string): typeof SORT_CHOICES {
  return SORT_CHOICES.filter((choice) => choice.value !== "relevance" || q.trim());
}

/** The request for the list. The fit filter needs the profile's codes; without them it filters nothing. */
export function toNoticeFilters(state: ListState, profileCpvCodes: readonly string[] | null): NoticeFilters {
  const cpv = state.isFitOnly && profileCpvCodes && profileCpvCodes.length > 0 ? profileCpvCodes.join(",") : undefined;
  return {
    q: state.q.trim() || undefined,
    status: state.status === "all" ? undefined : state.status,
    source: state.source ?? undefined,
    cpv,
    buyer: state.buyer ?? undefined,
    sort: state.sort ?? undefined,
    limit: PAGE_SIZE,
    offset: (state.page - 1) * PAGE_SIZE,
  };
}

/**
 * What the buyer choices are counted with: the list's own filters but the buyer and the paging, so each buyer's count
 * is what the list shows when it is chosen.
 */
export function toBuyerFilters({ q, status, source, cpv }: NoticeFilters): BuyerFilters {
  return { q, status, source, cpv };
}

export function hasNarrowingFilters(state: ListState): boolean {
  return Boolean(state.q.trim() || state.source || state.buyer || state.isFitOnly);
}

/** "Rensa filter": everything that narrows the list goes, the status and the order stay. */
export const CLEARED_FILTERS: Partial<ListState> = { q: "", source: null, buyer: null, isFitOnly: false };

export function useListState(): { state: ListState; update: (changes: Partial<ListState>) => void } {
  const [params, setParams] = useSearchParams();
  const update = (changes: Partial<ListState>) =>
    setParams((current) => applyChanges(current, changes), { replace: true });
  return { state: parseListState(params), update };
}
