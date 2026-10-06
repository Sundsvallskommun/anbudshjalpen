/**
 * The last check before the tender is handed in (direction.md, section 4 "Steg 4 Lämna in"): every skall- and
 * kvalificeringskrav and every attachment to tick off. What the draft review judged "Ser bra ut" comes ticked and
 * marked as reviewed; what it did not find is flagged. Pure functions, tested without rendering.
 */
import type { AttachmentCheck, CheckStatus, Checklist, ReviewView } from "../../../../api/types";
import { attachmentGroups } from "../../../../components/checklist/checklistModel";
import { splitTitleAndBody } from "../../../../lib/text";
import { attachmentCheckFor } from "../review/reviewModel";

/** What the review said about an item: a requirement's status, or an attachment's in the same words. */
export type SubmitReview = CheckStatus | null;

export interface SubmitItem {
  /** "krav:K12" or "bilaga:<key>", the value kept in the browser. */
  value: string;
  label: string;
  description: string | null;
  review: SubmitReview;
}

export interface SubmitGroups {
  requirements: SubmitItem[];
  attachments: SubmitItem[];
}

function attachmentReview(check: AttachmentCheck | null): SubmitReview {
  if (!check) return null;
  if (check.status === "bifogad") return "uppfyllt";
  return check.status === "saknas" ? "saknas" : "oklart";
}

export function submitGroups(checklist: Checklist, review: ReviewView | null): SubmitGroups {
  const checks = new Map(review?.result.checks.map((check) => [check.requirement_id, check.status]));
  const requirements = checklist.requirements
    .filter((requirement) => requirement.kind === "skallkrav" || requirement.kind === "kvalificeringskrav")
    .map((requirement) => ({
      value: `krav:${requirement.id}`,
      label: splitTitleAndBody(requirement.title, requirement.plain_language).title,
      description: requirement.evidence ? `Bevis: ${requirement.evidence.trim().replace(/\.$/u, "")}.` : null,
      review: checks.get(requirement.id) ?? null,
    }));
  const { required, conditional } = attachmentGroups(checklist.attachments);
  const attachments = [...required, ...conditional].map((item) => {
    const found = attachmentReview(review ? attachmentCheckFor(item.names, review.result.attachments) : null);
    return {
      value: `bilaga:${item.key}`,
      label: item.number ? `${item.name} (${item.number.toLocaleLowerCase("sv")})` : item.name,
      description: item.isConditional ? "Bara i vissa fall" : item.description,
      // An attachment needed only in some cases is no gap when the draft lacks it; it is marked only when found.
      review: item.isConditional && found !== "uppfyllt" ? null : found,
    };
  });
  return { requirements, attachments };
}

/** The items the review found in the draft: ticked from the start. */
export function reviewedValues(groups: SubmitGroups): string[] {
  return [...groups.requirements, ...groups.attachments].filter((item) => item.review === "uppfyllt").map((item) => item.value);
}

/** Ticked values that still belong to the checklist, so an old tick for a removed item does not count. */
export function knownValues(groups: SubmitGroups, values: readonly string[]): string[] {
  const known = new Set([...groups.requirements, ...groups.attachments].map((item) => item.value));
  return values.filter((value) => known.has(value));
}
