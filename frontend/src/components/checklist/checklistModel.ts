/**
 * A checklist (tolka_underlag's output) shaped for reading: requirements per kind, attachments without duplicates
 * and with the conditional ones apart, the evaluation as shares, and the key dates in date order with periods and
 * without the ISO dates the extraction leaves in the text (direction.md, section 4 "Steg 1 Krav"). Pure functions,
 * so the rules are tested without rendering.
 */
import type {
  Checklist,
  Citation,
  DateKind,
  EvaluationCriterion,
  IsoDate,
  KeyDate,
  RequiredAttachment,
  Requirement,
  RequirementKind,
  TermExplanation,
} from "../../api/types";
import { keyDateIndex } from "../../lib/keyDates";
import { citationPage, DATE_KIND, REQUIREMENT_KINDS } from "../../lib/labels";
import { normalizeForComparison } from "../../lib/text";

// --- Requirements ----------------------------------------------------------------------------

export interface RequirementSection {
  kind: RequirementKind;
  /** The section's anchor ("skallkrav"); statistic tiles and the outline link to it. */
  id: string;
  title: string;
  /** What the group is, under its heading. */
  helper: string;
  /** The words for the count in the section's name: "Skallkrav, 11 krav". */
  countNoun: readonly [one: string, many: string];
  /** Skallkrav and kvalificeringskrav are open from the start (direction.md, section 2); the rest are closed. */
  defaultOpen: boolean;
}

const SECTION_IDS: Record<RequirementKind, string> = {
  skallkrav: "skallkrav",
  kvalificeringskrav: "kvalificeringskrav",
  krav_pa_uppdraget: "krav-pa-uppdraget",
  avtalsvillkor: "avtalsvillkor",
};

const OPEN_KINDS: ReadonlySet<RequirementKind> = new Set(["skallkrav", "kvalificeringskrav"]);

/** The four requirement groups in reading order: what can stop a tender first. */
export const REQUIREMENT_SECTIONS: readonly RequirementSection[] = REQUIREMENT_KINDS.map(({ kind, label, description }) => ({
  kind,
  id: SECTION_IDS[kind],
  title: label,
  helper: description,
  countNoun: kind === "avtalsvillkor" ? (["villkor", "villkor"] as const) : (["krav", "krav"] as const),
  defaultOpen: OPEN_KINDS.has(kind),
}));

/** The section of a requirement kind. */
export function requirementSection(kind: RequirementKind): RequirementSection {
  return REQUIREMENT_SECTIONS.find((section) => section.kind === kind)!;
}

/** The requirements of each kind, in the checklist's order. */
export function requirementsByKind(requirements: readonly Requirement[]): Record<RequirementKind, Requirement[]> {
  const groups: Record<RequirementKind, Requirement[]> = {
    skallkrav: [],
    kvalificeringskrav: [],
    krav_pa_uppdraget: [],
    avtalsvillkor: [],
  };
  for (const requirement of requirements) groups[requirement.kind].push(requirement);
  return groups;
}

// --- Attachments -----------------------------------------------------------------------------

export interface AttachmentItem {
  /** Stable within one checklist: the first merged attachment's position and name. */
  key: string;
  name: string;
  /** "Bilaga 1" when the document numbers the attachment and its name does not say so already. */
  number: string | null;
  description: string | null;
  citation: Citation;
  /** Only needed in some cases ("om ni är etablerade i ett annat land"). */
  isConditional: boolean;
  /** Every name the merged attachments had, to match a draft review's attachment checks. */
  names: string[];
}

export interface AttachmentGroups {
  required: AttachmentItem[];
  conditional: AttachmentItem[];
}

const NUMBERED = /\bbilaga\s*(\d+)\b/iu;
const ONLY_A_NUMBER = /^bilaga\s*\d+$/iu;
// "i prisbilagan (bilaga 1)": the word the document uses for a numbered attachment, just before its number.
const NAMED_BEFORE_NUMBER = /(\p{L}[\p{L}-]*)\s*\(\s*bilaga\s*(\d+)\s*\)/giu;
/**
 * Words for documents, in the definite form a sentence uses and the base form a list shows: "prisbilagan" is listed
 * as "Prisbilaga". Only these words name an attachment; "anbudet (bilaga 4)" names nothing.
 */
const DOCUMENT_NOUNS: readonly (readonly [definite: string, base: string])[] = [
  ["bilagan", "bilaga"],
  ["blanketten", "blankett"],
  ["beskrivningen", "beskrivning"],
  ["förteckningen", "förteckning"],
  ["redovisningen", "redovisning"],
  ["specifikationen", "specifikation"],
  ["försäkran", "försäkran"],
  ["intyget", "intyg"],
  ["beviset", "bevis"],
  ["formuläret", "formulär"],
  ["certifikatet", "certifikat"],
  ["åtagandet", "åtagande"],
  ["fullmakten", "fullmakt"],
  ["kalkylen", "kalkyl"],
  ["listan", "lista"],
  ["planen", "plan"],
  ["mallen", "mall"],
];
// Words that make an attachment depend on the supplier's situation.
const CONDITIONAL = [
  /\bom (ni|du|anbudsgivaren|leverantören|företaget|anbudet)\b/iu,
  /\bi förekommande fall\b/iu,
  /\bvid behov\b/iu,
  /\bbehöver (därför |dock )?inte\b/iu,
  /\bannat land\b/iu,
  /\bi vissa fall\b/iu,
  /\bendast (om|när|för)\b/iu,
  /\bgäller (bara|endast)\b/iu,
];

function numberOf(text: string | null | undefined): string | null {
  const match = text ? NUMBERED.exec(text) : null;
  return match ? `Bilaga ${match[1]}` : null;
}

function attachmentNumber(attachment: RequiredAttachment): string | null {
  return numberOf(attachment.name) ?? numberOf(attachment.description) ?? numberOf(attachment.citation.quote);
}

function citationKey(citation: Citation): string | null {
  const quote = normalizeForComparison(citation.quote);
  return quote ? `${citationPage(citation)}:${quote}` : null;
}

function isOnlyANumber(attachment: RequiredAttachment): boolean {
  return ONLY_A_NUMBER.test(attachment.name.trim());
}

/** A document word in its base form ("prisbilagan" → "prisbilaga"), or null for a word that names no document. */
function documentNoun(word: string): string | null {
  for (const [definite, base] of DOCUMENT_NOUNS) {
    if (word.endsWith(definite)) return `${word.slice(0, word.length - definite.length)}${base}`;
  }
  return DOCUMENT_NOUNS.some(([, base]) => word.endsWith(base)) ? word : null;
}

/**
 * What a number-only attachment is, from its quote: "Bilaga 1" whose quote says "i prisbilagan (bilaga 1)" is the
 * "Prisbilaga". Null when the quote does not say, or says only "bilaga".
 */
function nameFromQuote(attachment: RequiredAttachment): string | null {
  const number = attachmentNumber(attachment);
  if (!number) return null;
  for (const match of attachment.citation.quote.matchAll(NAMED_BEFORE_NUMBER)) {
    if (`Bilaga ${match[2]}` !== number) continue;
    const noun = documentNoun(match[1]!.toLocaleLowerCase("sv"));
    if (noun && noun !== "bilaga") return noun.charAt(0).toLocaleUpperCase("sv") + noun.slice(1);
  }
  return null;
}

/** The lowest attachment number of a merged attachment, to list them as the document numbers them. */
function sortNumber(members: readonly RequiredAttachment[]): number {
  const numbers = members
    .map(attachmentNumber)
    .filter((number): number is string => number !== null)
    .map((number) => Number.parseInt(number.replace(/\D/gu, ""), 10));
  return numbers.length > 0 ? Math.min(...numbers) : Number.POSITIVE_INFINITY;
}

function sameAttachment(member: RequiredAttachment, attachment: RequiredAttachment): boolean {
  const key = citationKey(attachment.citation);
  if (key && citationKey(member.citation) === key) return true;
  if (normalizeForComparison(member.name) === normalizeForComparison(attachment.name)) return true;
  // "Bilaga 4" and "Försäkringsbevis" whose quote says "(bilaga 4)": one of them is only the number.
  const number = attachmentNumber(attachment);
  return number !== null && number === attachmentNumber(member) && (isOnlyANumber(member) || isOnlyANumber(attachment));
}

interface Draft {
  index: number;
  members: RequiredAttachment[];
}

function toItem({ index, members }: Draft): AttachmentItem {
  const named = members.find((member) => !isOnlyANumber(member));
  const shown = named ?? members[0]!;
  // The key keeps the extraction's own name, so the ticks kept in the browser survive a better name.
  const extractedName = shown.name.trim();
  const name = named ? extractedName : (members.map(nameFromQuote).find((candidate) => candidate !== null) ?? extractedName);
  const description =
    members
      .map((member) => member.description?.trim() ?? "")
      .find((text) => text && normalizeForComparison(text) !== normalizeForComparison(name)) ?? null;
  const number = members.map(attachmentNumber).find((candidate) => candidate !== null) ?? null;
  const said = normalizeForComparison(`${name} ${description ?? ""}`);
  const texts = members.flatMap((member) => [member.name, member.description ?? "", member.citation.quote]);
  return {
    key: `${index}-${normalizeForComparison(extractedName)}`,
    name,
    number: number && !said.includes(number.toLocaleLowerCase("sv")) ? number : null,
    description,
    citation: shown.citation,
    isConditional: texts.some((text) => CONDITIONAL.some((pattern) => pattern.test(text))),
    names: members.map((member) => member.name),
  };
}

/**
 * The attachments to hand in, once each and in the document's numbering: the extraction often lists one attachment
 * twice, by its number ("Bilaga 4") and by what it is ("Försäkringsbevis"), with the same quote, and names some only
 * by number, which the quote then explains ("i prisbilagan (bilaga 1)"). The ones that apply only in some cases come
 * apart.
 */
export function attachmentGroups(attachments: readonly RequiredAttachment[]): AttachmentGroups {
  const drafts: Draft[] = [];
  attachments.forEach((attachment, index) => {
    const draft = drafts.find((candidate) => candidate.members.some((member) => sameAttachment(member, attachment)));
    if (draft) draft.members.push(attachment);
    else drafts.push({ index, members: [attachment] });
  });
  const items = drafts
    .map((draft) => ({ item: toItem(draft), number: sortNumber(draft.members) }))
    .sort((a, b) => (a.number === b.number ? 0 : a.number - b.number))
    .map(({ item }) => item);
  return {
    required: items.filter((item) => !item.isConditional),
    conditional: items.filter((item) => item.isConditional),
  };
}

// --- Evaluation ------------------------------------------------------------------------------

export interface EvaluationShare {
  name: string;
  weight: number;
}

/** The criteria as shares of a whole, when there are at least two and their weights add up to 100 %. */
export function evaluationShares(evaluation: readonly EvaluationCriterion[]): EvaluationShare[] | null {
  const weighted = evaluation.filter((criterion) => criterion.weight_percent !== null && criterion.weight_percent > 0);
  if (weighted.length < 2 || weighted.length !== evaluation.length) return null;
  const total = weighted.reduce((sum, criterion) => sum + (criterion.weight_percent ?? 0), 0);
  if (Math.abs(total - 100) > 1) return null;
  return weighted.map((criterion) => ({ name: criterion.name.trim(), weight: criterion.weight_percent ?? 0 }));
}

function percent(value: number): string {
  return String(Math.round(value));
}

/** The evaluation as one figure for a statistic tile: "70/30" "pris/kvalitet", or how many criteria there are. */
export function evaluationFigure(evaluation: readonly EvaluationCriterion[]): { value: string; label: string } | null {
  if (evaluation.length === 0) return null;
  const shares = evaluationShares(evaluation);
  if (shares && shares.length <= 3) {
    return {
      value: shares.map((share) => percent(share.weight)).join("/"),
      label: shares.map((share) => share.name.toLocaleLowerCase("sv")).join("/"),
    };
  }
  const only = evaluation.length === 1 ? evaluation[0] : undefined;
  if (only && only.weight_percent !== null) {
    return { value: `${percent(only.weight_percent)} %`, label: only.name.trim().toLocaleLowerCase("sv") };
  }
  return { value: String(evaluation.length), label: evaluation.length === 1 ? "utvärderingskriterium" : "utvärderingskriterier" };
}

/** A criterion's name with its weight: "Pris 70 %". */
export function criterionHeading(criterion: EvaluationCriterion): string {
  return criterion.weight_percent !== null ? `${criterion.name.trim()} ${percent(criterion.weight_percent)} %` : criterion.name.trim();
}

/**
 * What a criterion's own text adds to its name and weight, or null. The extraction sometimes only repeats the
 * heading ("Pris 70 % 70"), which says nothing more.
 */
export function criterionDetail(criterion: EvaluationCriterion): string | null {
  const text = criterion.how_assessed.trim();
  const heading = normalizeForComparison(criterionHeading(criterion));
  const normalized = normalizeForComparison(text);
  if (!normalized || normalized === heading) return null;
  const rest = normalized.startsWith(heading) ? normalized.slice(heading.length) : normalized;
  return /\p{L}/u.test(rest) ? text : null;
}

// --- Key dates -------------------------------------------------------------------------------

export type ReminderDateKind = "fragestopp" | "sista_anbudsdag";

export interface DateRow {
  key: string;
  kind: DateKind;
  /** The date, or the first day of a period. */
  from: IsoDate | null;
  /** The last day of a period ("17 maj – 25 jun 2027"), else null. */
  to: IsoDate | null;
  /** What happens that day, without the ISO date the extraction leaves in: "Sista anbudsdag kl. 23:59". */
  text: string;
  /** More from the document when the text is the kind's own label: "Frågor ställs i e-Avrop.". */
  detail: string | null;
  citation: Citation;
  /** The deadline the backend reminds about from this row (the first dated entry of its kind), else null. */
  reminder: ReminderDateKind | null;
}

export interface DateGroups {
  /** Up to and including sista anbudsdag: what a supplier has to act on. */
  before: DateRow[];
  /** After the tender deadline: the award, the contract and the work itself. */
  after: DateRow[];
}

const ISO_DATE = /\d{4}-\d{2}-\d{2}/gu;
const ISO_IN_TEXT = /\s*\d{4}-\d{2}-\d{2}(?:\s*[–-]\s*\d{4}-\d{2}-\d{2})?/gu;
// A table's "Datum" label just before its date ("… enligt 6 kap. 2 § LOU Datum 2026-09-21"); the date column says it.
const DATE_LABEL = /(^|\s)Datum\s+(?=\d{4}-\d{2}-\d{2})/gu;
const CLOCK = /\bkl\.?\s*(\d{1,2})[.:](\d{2})\b/giu;
const GENERIC_TEXTS = new Set(["", "datum"]);

/**
 * A key date's description without its ISO dates (the date column shows them), or the table label before one, and
 * with the time written the copy rules' way: "Frivilligt platsbesök 2026-10-15 kl. 14.00" becomes "Frivilligt
 * platsbesök kl. 14:00".
 */
export function cleanDateText(text: string): string {
  return text
    .replace(DATE_LABEL, "$1")
    .replace(ISO_IN_TEXT, "")
    .replace(CLOCK, (_match, hour: string, minute: string) => `kl. ${hour.padStart(2, "0")}:${minute}`)
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([.,;:])/gu, "$1")
    .replace(/[\s,;:–-]+$/u, "")
    .trim();
}

function textAndDetail(date: KeyDate): { text: string; detail: string | null } {
  const cleaned = cleanDateText(date.description);
  const label = DATE_KIND[date.kind];
  const isGeneric = GENERIC_TEXTS.has(normalizeForComparison(cleaned));
  if (date.kind === "annat") return { text: isGeneric ? "Datum i underlaget" : cleaned, detail: null };
  if (isGeneric) return { text: label, detail: null };
  // "Sista anbudsdag kl. 23:59" says more than the label; "Frågor ställs i e-Avrop." needs the label before it.
  if (normalizeForComparison(cleaned).includes(normalizeForComparison(label))) return { text: cleaned, detail: null };
  return { text: label, detail: cleaned };
}

/** A period the description names ("2027-05-17 – 2027-06-25") when the row's date is one of its ends. */
function periodOf(date: KeyDate): { from: IsoDate | null; to: IsoDate | null } {
  const named = [...new Set(date.description.match(ISO_DATE) ?? [])].sort();
  if (date.date && named.length === 2 && named.includes(date.date)) return { from: named[0]!, to: named[1]! };
  return { from: date.date, to: null };
}

const BEFORE_KINDS: ReadonlySet<DateKind> = new Set(["fragestopp", "sista_anbudsdag"]);

/**
 * The checklist's key dates in date order, split at sista anbudsdag (`deadline`, a calendar date). The two rows the
 * extraction makes of a period (its start and its end) become one; a row the backend reminds about keeps that mark.
 * Undated rows come last: the deadlines among them before the tender, the rest after it.
 */
export function dateGroups(checklist: Checklist, deadline: IsoDate | null): DateGroups {
  const reminders = new Map<number, ReminderDateKind>(
    (["fragestopp", "sista_anbudsdag"] as const).map((kind) => [keyDateIndex(checklist, kind), kind]),
  );
  const rows: (DateRow & { index: number })[] = [];
  checklist.dates.forEach((date, index) => {
    const { from, to } = periodOf(date);
    const { text, detail } = textAndDetail(date);
    const key = `${normalizeForComparison(text)}|${from ?? ""}|${to ?? ""}`;
    const reminder = reminders.get(index) ?? null;
    const same = rows.find((row) => row.key === key);
    if (same) {
      same.reminder ??= reminder;
      return;
    }
    rows.push({ key, kind: date.kind, from, to, text, detail, citation: date.citation, reminder, index });
  });
  rows.sort((a, b) => {
    if (a.from && b.from && a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (Boolean(a.from) !== Boolean(b.from)) return a.from ? -1 : 1;
    return a.index - b.index;
  });
  const groups: DateGroups = { before: [], after: [] };
  for (const row of rows) {
    const isBefore = row.from ? deadline === null || row.from <= deadline : BEFORE_KINDS.has(row.kind);
    const { key, kind, from, to, text, detail, citation, reminder } = row;
    groups[isBefore ? "before" : "after"].push({ key, kind, from, to, text, detail, citation, reminder });
  }
  return groups;
}

// --- Terms -----------------------------------------------------------------------------------

/** The first few names as a sentence, for a closed section's helper line: "Sanningsförsäkran, avtalsspärr, F-skatt.". */
export function namePreview(names: readonly string[], max = 6): string {
  const shown = names.slice(0, max).map((name) => name.trim()).filter(Boolean);
  if (shown.length === 0) return "";
  const line = `${shown.join(", ")}${names.length > max ? " …" : "."}`;
  return line.charAt(0).toLocaleUpperCase("sv") + line.slice(1);
}

/** The first terms as a line under the closed section's heading. */
export function termPreview(terms: readonly TermExplanation[], max = 6): string {
  return namePreview(
    terms.map((term) => term.term),
    max,
  );
}

// --- Text from older engine runs -------------------------------------------------------------

/** The rule-based engine's old lead-in, which checklists stored before the redesign still carry (backend HEURISTIC_PREFIX). */
const ENGINE_PREFIX = /^\s*Automatisk sammanställning utan språkmodell:\s*/iu;

/** A text without the engine's lead-in: the provenance line names the engine once (direction.md, section 9.5). */
export function withoutEnginePrefix(text: string): string {
  if (!ENGINE_PREFIX.test(text)) return text;
  const rest = text.replace(ENGINE_PREFIX, "");
  return rest.charAt(0).toLocaleUpperCase("sv") + rest.slice(1);
}
