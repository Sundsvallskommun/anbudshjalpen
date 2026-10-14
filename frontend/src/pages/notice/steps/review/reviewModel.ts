/**
 * A draft review grouped by what the reader does first (direction.md, section 2 "Granskningens gruppering"): Måste
 * åtgärdas, Kontrollera själv and Ser bra ut for the skall- and kvalificeringskrav, and the neutral groups Krav på
 * uppdraget and Avtalsvillkor. The requirement's kind comes from the published checklist by `requirement_id`, so the
 * review contract needs nothing more. Pure functions, tested without rendering.
 */
import type {
  AttachmentCheck,
  CheckStatus,
  Checklist,
  RequiredAttachment,
  Requirement,
  RequirementCheck,
  RequirementKind,
  ReviewView,
} from "../../../../api/types";
import { attachmentGroups } from "../../../../components/checklist/checklistModel";
import { CHECK_STATUS } from "../../../../lib/labels";
import { plural } from "../../../../lib/format";
import { normalizeForComparison, splitTitleAndBody } from "../../../../lib/text";

export type ReviewGroupId = "atgarda" | "kontrollera" | "bra" | "uppdraget" | "villkor";

export interface ReviewItem {
  check: RequirementCheck;
  /** The checklist's requirement, or null when the checklist no longer has it. */
  requirement: Requirement | null;
  title: string;
}

export interface ReviewGroup {
  id: ReviewGroupId;
  title: string;
  /** The words for the count in the section's name: "Bör åtgärdas, 3 krav". */
  countNoun: readonly [string, string];
  items: ReviewItem[];
  /** What the group is, or the comment every row shares, said once (direction.md: "skrivs den en gång som grupptext"). */
  helper: string | null;
  /** Rows of a neutral group show their status; the action groups say it in their heading. */
  isNeutral: boolean;
  /** Bör åtgärdas starts open; the others are closed. */
  defaultOpen: boolean;
}

// Within Bör åtgärdas, what was not found at all comes before what lacks its proof.
const STATUS_ORDER: Record<CheckStatus, number> = { saknas: 0, obevisat: 1, oklart: 2, uppfyllt: 3 };

function groupOf(status: CheckStatus, kind: RequirementKind): ReviewGroupId {
  if (kind === "krav_pa_uppdraget") return "uppdraget";
  if (kind === "avtalsvillkor") return "villkor";
  if (status === "saknas" || status === "obevisat") return "atgarda";
  return status === "oklart" ? "kontrollera" : "bra";
}

const GROUPS: Record<ReviewGroupId, Omit<ReviewGroup, "items" | "helper"> & { describe: string | null }> = {
  atgarda: { id: "atgarda", title: "Bör åtgärdas", countNoun: ["krav", "krav"], isNeutral: false, defaultOpen: true, describe: null },
  kontrollera: {
    id: "kontrollera",
    title: "Kontrollera själv",
    countNoun: ["krav", "krav"],
    isNeutral: false,
    defaultOpen: false,
    describe: "Utkastet nämner delvis samma sak. Läs kravet och kontrollera att ditt svar räcker.",
  },
  bra: { id: "bra", title: "Ser bra ut", countNoun: ["krav", "krav"], isNeutral: false, defaultOpen: false, describe: null },
  uppdraget: {
    id: "uppdraget",
    title: "Krav på uppdraget",
    countNoun: ["krav", "krav"],
    isNeutral: true,
    defaultOpen: false,
    describe: "Hur arbetet ska utföras. Du visar dem främst i genomförandebeskrivningen och bekräftar dem när du lämnar anbud.",
  },
  villkor: {
    id: "villkor",
    title: "Avtalsvillkor",
    countNoun: ["villkor", "villkor"],
    isNeutral: true,
    defaultOpen: false,
    describe: "Gäller när avtalet är tecknat. De godtas oftast genom att du lämnar anbud. Kontrollera om underlaget kräver att du intygar dem.",
  },
};

export const REVIEW_GROUP_ORDER: readonly ReviewGroupId[] = ["atgarda", "kontrollera", "bra", "uppdraget", "villkor"];

/** The comment every row shares, when there are several rows and they all say the same. */
function sharedComment(items: readonly ReviewItem[]): string | null {
  if (items.length < 2) return null;
  const first = items[0]!.check.comment.trim();
  return first && items.every((item) => item.check.comment.trim() === first) ? first : null;
}

/** "Till exempel: Anbudet är skrivet på svenska · Anbudet gäller till och med 7 februari 2027." */
function examples(items: readonly ReviewItem[]): string | null {
  if (items.length === 0) return null;
  return `Till exempel: ${items
    .slice(0, 3)
    .map((item) => item.title.replace(/[.!?]+$/u, ""))
    .join(" · ")}.`;
}

/** The review's rows in their groups, every group present (possibly empty), in reading order. */
export function reviewGroups(view: ReviewView, checklist: Checklist | null): ReviewGroup[] {
  const requirements = new Map(checklist?.requirements.map((requirement, index) => [requirement.id, { requirement, index }]));
  const items = view.result.checks
    .map((check) => {
      const known = requirements.get(check.requirement_id);
      const title = known
        ? splitTitleAndBody(known.requirement.title, known.requirement.plain_language).title
        : (view.requirement_titles[check.requirement_id] ?? check.requirement_id);
      return { item: { check, requirement: known?.requirement ?? null, title }, index: known?.index ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => STATUS_ORDER[a.item.check.status] - STATUS_ORDER[b.item.check.status] || a.index - b.index)
    .map(({ item }) => item);

  return REVIEW_GROUP_ORDER.map((id) => {
    const { describe, ...group } = GROUPS[id];
    const members = items.filter((item) => groupOf(item.check.status, item.requirement?.kind ?? "skallkrav") === id);
    const shared = group.isNeutral ? null : sharedComment(members);
    const helper = shared ?? (id === "bra" ? examples(members) : describe);
    return { ...group, items: members, helper };
  });
}

export interface ReviewVerdict {
  /** "3 saker bör åtgärdas innan du lämnar anbudet". */
  title: string;
  mustFix: number;
  good: number;
  /** Skall- and kvalificeringskrav the review checked. */
  essential: number;
  /** Krav på uppdraget and avtalsvillkor. */
  others: number;
}

export function reviewVerdict(groups: readonly ReviewGroup[]): ReviewVerdict {
  const count = (id: ReviewGroupId) => groups.find((group) => group.id === id)?.items.length ?? 0;
  const mustFix = count("atgarda");
  const toCheck = count("kontrollera");
  const good = count("bra");
  const essential = mustFix + toCheck + good;
  const title =
    mustFix > 0
      ? `${plural(mustFix, "sak bör", "saker bör")} åtgärdas innan du lämnar anbudet`
      : toCheck > 0
        ? `Inget verkar behöva åtgärdas, men ${plural(toCheck, "krav", "krav")} bör du kontrollera själv`
        : "Skall- och kvalificeringskraven ser bra ut";
  return { title, mustFix, good, essential, others: count("uppdraget") + count("villkor") };
}

/**
 * Where a quote from the draft is: "Ur ditt utkast, s. 2", or with the file when the draft has several
 * ("Ur forsakringsbevis.pdf, s. 1", decision 0025).
 */
export function draftSource(check: Pick<RequirementCheck, "draft_document" | "draft_page">): string {
  const where = check.draft_document ? `Ur ${check.draft_document}` : "Ur ditt utkast";
  return check.draft_page ? `${where}, s. ${check.draft_page}` : where;
}

/** The question "Fråga om kravet" puts in the composer. */
export function questionAbout(title: string): string {
  return `Hur visar jag att vi uppfyller kravet ”${title.replace(/[.!?]+$/u, "")}”?`;
}

/** An attachment's review in words, for its chip: "Prisbilaga, med i utkastet". */
export function attachmentStatusText(check: Pick<AttachmentCheck, "status">): string {
  if (check.status === "bifogad") return "med i utkastet";
  if (check.status === "saknas") return "inte med i utkastet";
  return CHECK_STATUS.oklart.toLocaleLowerCase("sv");
}

/** The attachments the draft has: "3 av 5". */
export function attachedCount(attachments: readonly Pick<AttachmentCheck, "status">[]): { attached: number; total: number } {
  return { attached: attachments.filter((check) => check.status === "bifogad").length, total: attachments.length };
}

export interface AttachmentVerdict {
  /** The checklist's attachment by what it is ("Prisbilaga"), or the review's own name for one the checklist lacks. */
  name: string;
  status: AttachmentCheck["status"];
}

/**
 * The review's verdict on each attachment to hand in, as step 1 lists them: once each (the extraction names some twice,
 * by number and by what they are), by what they are and in the document's numbering. Attachments needed only in some
 * cases are left out, since a draft without one has no gap; a verdict on an attachment the checklist does not have
 * keeps the review's name.
 */
export function attachmentVerdicts(
  attachments: readonly RequiredAttachment[],
  checks: readonly AttachmentCheck[],
): AttachmentVerdict[] {
  const { required, conditional } = attachmentGroups(attachments);
  const known = new Set([...required, ...conditional].flatMap((item) => item.names.map(normalizeForComparison)));
  const listed = required.flatMap((item) => {
    const check = attachmentCheckFor(item.names, checks);
    return check ? [{ name: item.name, status: check.status }] : [];
  });
  const others = checks
    .filter((check) => !known.has(normalizeForComparison(check.name)))
    .map((check) => ({ name: check.name, status: check.status }));
  return [...listed, ...others];
}

/** A review's verdict on one attachment of the checklist, by any of the names the extraction gave it. */
export function attachmentCheckFor(names: readonly string[], checks: readonly AttachmentCheck[]): AttachmentCheck | null {
  const wanted = new Set(names.map(normalizeForComparison));
  const matching = checks.filter((check) => wanted.has(normalizeForComparison(check.name)));
  return (
    matching.find((check) => check.status === "bifogad") ??
    matching.find((check) => check.status === "oklart") ??
    matching[0] ??
    null
  );
}
