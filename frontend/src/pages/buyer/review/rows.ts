/**
 * The checklist under review as rows (direction.md, section 4 "Inköp: Granska checklista"): every part companies see
 * is a row the buyer can select, check, edit and remove. Rows carry a key that survives other rows being removed, so
 * a "Kontrollerad" mark stays on its row. Pure functions, tested without rendering.
 */
import type {
  Checklist,
  Citation,
  EvaluationCriterion,
  KeyDate,
  RequiredAttachment,
  Requirement,
  RequirementKind,
  TermExplanation,
} from "../../../api/types";
import { formatNumber } from "../../../lib/format";
import { DATE_KIND, REQUIREMENT_KINDS } from "../../../lib/labels";
import { splitTitleAndBody } from "../../../lib/text";

/** One editable part of a checklist, by the list it belongs to. */
export type RowItem =
  | { section: "requirement"; value: Requirement }
  | { section: "date"; value: KeyDate }
  | { section: "attachment"; value: RequiredAttachment }
  | { section: "evaluation"; value: EvaluationCriterion }
  | { section: "term"; value: TermExplanation }
  | { section: "question"; value: string };

export type RowSection = RowItem["section"];

/** The groups the list shows, in order: the four kinds of requirement, then the other parts. */
export type GroupId = RequirementKind | "dates" | "attachments" | "evaluation" | "terms" | "questions";

export interface GroupInfo {
  id: GroupId;
  title: string;
  /** Singular and plural for the count in the group's name ("Skallkrav, 3 krav"). */
  countNoun: readonly [string, string];
}

export const GROUPS: readonly GroupInfo[] = [
  ...REQUIREMENT_KINDS.map(({ kind, label }) => ({ id: kind, title: label, countNoun: ["krav", "krav"] as const })),
  { id: "dates", title: "Viktiga datum", countNoun: ["datum", "datum"] },
  { id: "attachments", title: "Bilagor att lämna in", countNoun: ["bilaga", "bilagor"] },
  { id: "evaluation", title: "Så utvärderas anbuden", countNoun: ["kriterium", "kriterier"] },
  { id: "terms", title: "Ord och begrepp", countNoun: ["begrepp", "begrepp"] },
  { id: "questions", title: "Det här är oklart i underlaget", countNoun: ["oklarhet", "oklarheter"] },
];

export function groupInfo(id: GroupId): GroupInfo {
  return GROUPS.find((group) => group.id === id)!;
}

export interface ReviewRow {
  /** Stable while other rows come and go: "krav:K12", "datum:fragestopp:2026-10-16:Frågor ställs …". */
  key: string;
  /** Where the item is in its list in the checklist. */
  index: number;
  item: RowItem;
  group: GroupId;
  /** What the row says, as the list shows it and as the source dialog names the claim. */
  title: string;
  citation: Citation | null;
}

const KEY_TEXT_MAX = 60;

function keyText(text: string): string {
  return text.trim().replace(/\s+/gu, " ").slice(0, KEY_TEXT_MAX);
}

/** The key of an item, before telling identical items apart. */
export function baseKey(item: RowItem): string {
  switch (item.section) {
    case "requirement":
      return `krav:${item.value.id}`;
    case "date":
      return `datum:${item.value.kind}:${item.value.date ?? ""}:${keyText(item.value.description)}`;
    case "attachment":
      return `bilaga:${keyText(item.value.name)}`;
    case "evaluation":
      return `utvardering:${keyText(item.value.name)}`;
    case "term":
      return `begrepp:${keyText(item.value.term)}`;
    case "question":
      return `oklarhet:${keyText(item.value)}`;
  }
}

/**
 * What a row shows as its title. A requirement's title cut off with "…" gives way to the whole first sentence of its
 * explanation, as companies see it (RequirementRow), so the buyer reviews the words companies will read.
 */
export function itemTitle(item: RowItem): string {
  switch (item.section) {
    case "requirement":
      return splitTitleAndBody(item.value.title, item.value.plain_language).title;
    case "date":
      return item.value.description.trim() || DATE_KIND[item.value.kind];
    case "attachment":
      return item.value.name;
    case "evaluation":
      return item.value.weight_percent === null
        ? item.value.name
        : `${item.value.name} ${formatNumber(item.value.weight_percent)} %`;
    case "term":
      return item.value.term;
    case "question":
      return item.value;
  }
}

export function itemCitation(item: RowItem): Citation | null {
  return item.section === "question" ? null : item.value.citation;
}

/** The group an item is shown in: its kind for a requirement, else its list. */
export function groupOf(item: RowItem): GroupId {
  switch (item.section) {
    case "requirement":
      return item.value.kind;
    case "date":
      return "dates";
    case "attachment":
      return "attachments";
    case "evaluation":
      return "evaluation";
    case "term":
      return "terms";
    case "question":
      return "questions";
  }
}

/** Every item of a checklist, list by list, in the checklist's own order. */
function items(checklist: Checklist): RowItem[] {
  return [
    ...checklist.requirements.map((value): RowItem => ({ section: "requirement", value })),
    ...checklist.dates.map((value): RowItem => ({ section: "date", value })),
    ...checklist.attachments.map((value): RowItem => ({ section: "attachment", value })),
    ...checklist.evaluation.map((value): RowItem => ({ section: "evaluation", value })),
    ...checklist.terms.map((value): RowItem => ({ section: "term", value })),
    ...checklist.open_questions.map((value): RowItem => ({ section: "question", value })),
  ];
}

/**
 * The checklist as rows. Identical items (two equal dates, say) get "#2", "#3" after their key, so every row has its
 * own key.
 */
export function checklistRows(checklist: Checklist): ReviewRow[] {
  const seen = new Map<string, number>();
  const indexes = new Map<RowSection, number>();
  return items(checklist).map((item) => {
    const index = indexes.get(item.section) ?? 0;
    indexes.set(item.section, index + 1);
    const base = baseKey(item);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return {
      key: occurrence === 1 ? base : `${base}#${occurrence}`,
      index,
      item,
      group: groupOf(item),
      title: itemTitle(item),
      citation: itemCitation(item),
    };
  });
}

/** The rows in display order: grouped as GROUPS says, each group in the checklist's order. */
export function groupedRows(rows: readonly ReviewRow[]): { group: GroupInfo; rows: ReviewRow[] }[] {
  return GROUPS.map((group) => ({ group, rows: rows.filter((row) => row.group === group.id) })).filter(
    (entry) => entry.rows.length > 0,
  );
}

function replaceAt<T>(list: readonly T[], index: number | null, value: T): T[] {
  if (index === null || index < 0 || index >= list.length) return [...list, value];
  return list.map((current, at) => (at === index ? value : current));
}

function insertAt<T>(list: readonly T[], index: number, value: T): T[] {
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), value, ...list.slice(at)];
}

function without<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, at) => at !== index);
}

/** The checklist with an item saved: replaced at `index`, or added at the end of its list when `index` is null. */
export function withItem(checklist: Checklist, item: RowItem, index: number | null): Checklist {
  switch (item.section) {
    case "requirement":
      return { ...checklist, requirements: replaceAt(checklist.requirements, index, item.value) };
    case "date":
      return { ...checklist, dates: replaceAt(checklist.dates, index, item.value) };
    case "attachment":
      return { ...checklist, attachments: replaceAt(checklist.attachments, index, item.value) };
    case "evaluation":
      return { ...checklist, evaluation: replaceAt(checklist.evaluation, index, item.value) };
    case "term":
      return { ...checklist, terms: replaceAt(checklist.terms, index, item.value) };
    case "question":
      return { ...checklist, open_questions: replaceAt(checklist.open_questions, index, item.value) };
  }
}

/** The checklist with an item put back where it was ("Ångra" after "Ta bort"). */
export function withItemInserted(checklist: Checklist, item: RowItem, index: number): Checklist {
  switch (item.section) {
    case "requirement":
      return { ...checklist, requirements: insertAt(checklist.requirements, index, item.value) };
    case "date":
      return { ...checklist, dates: insertAt(checklist.dates, index, item.value) };
    case "attachment":
      return { ...checklist, attachments: insertAt(checklist.attachments, index, item.value) };
    case "evaluation":
      return { ...checklist, evaluation: insertAt(checklist.evaluation, index, item.value) };
    case "term":
      return { ...checklist, terms: insertAt(checklist.terms, index, item.value) };
    case "question":
      return { ...checklist, open_questions: insertAt(checklist.open_questions, index, item.value) };
  }
}

/** The checklist without the item at `index` of a list. */
export function withoutItem(checklist: Checklist, section: RowSection, index: number): Checklist {
  switch (section) {
    case "requirement":
      return { ...checklist, requirements: without(checklist.requirements, index) };
    case "date":
      return { ...checklist, dates: without(checklist.dates, index) };
    case "attachment":
      return { ...checklist, attachments: without(checklist.attachments, index) };
    case "evaluation":
      return { ...checklist, evaluation: without(checklist.evaluation, index) };
    case "term":
      return { ...checklist, terms: without(checklist.terms, index) };
    case "question":
      return { ...checklist, open_questions: without(checklist.open_questions, index) };
  }
}

/** The next free id in the checklist's own scheme (K1, K2, …). */
export function nextRequirementId(requirements: readonly Requirement[]): string {
  const used = new Set(requirements.map((requirement) => requirement.id));
  let number = requirements.length + 1;
  while (used.has(`K${number}`)) number += 1;
  return `K${number}`;
}

/** An empty citation on a page, for a new item. */
export function emptyCitation(page = 1): Citation {
  return { page, quote: "", check: null, found_page: null, document: null, document_id: null };
}

/** A new, empty item of a list, its citation on `page` (the page the buyer is reading). */
export function newItem(checklist: Checklist, section: RowSection, page = 1): RowItem {
  switch (section) {
    case "requirement":
      return {
        section,
        value: {
          id: nextRequirementId(checklist.requirements),
          kind: "skallkrav",
          title: "",
          plain_language: "",
          evidence: null,
          citation: emptyCitation(page),
        },
      };
    case "date":
      return { section, value: { kind: "annat", date: null, description: "", citation: emptyCitation(page) } };
    case "attachment":
      return { section, value: { name: "", description: null, citation: emptyCitation(page) } };
    case "evaluation":
      return { section, value: { name: "", weight_percent: null, how_assessed: "", citation: emptyCitation(page) } };
    case "term":
      return { section, value: { term: "", explanation: "", citation: null } };
    case "question":
      return { section, value: "" };
  }
}

/** The words for an item of a list, for headings, menus and the message after "Ta bort". */
export const ITEM_NOUN: Record<RowSection, { new: string; change: string; removed: string }> = {
  requirement: { new: "Nytt krav", change: "Ändra kravet", removed: "Kravet är borttaget" },
  date: { new: "Nytt datum", change: "Ändra datumet", removed: "Datumet är borttaget" },
  attachment: { new: "Ny bilaga", change: "Ändra bilagan", removed: "Bilagan är borttagen" },
  evaluation: {
    new: "Nytt utvärderingskriterium",
    change: "Ändra utvärderingskriteriet",
    removed: "Utvärderingskriteriet är borttaget",
  },
  term: { new: "Nytt begrepp", change: "Ändra begreppet", removed: "Begreppet är borttaget" },
  question: { new: "Ny oklarhet", change: "Ändra oklarheten", removed: "Oklarheten är borttagen" },
};
