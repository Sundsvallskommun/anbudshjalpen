/**
 * "Möjliga anbudsgivare" (decision 0023): the job inköp describes, what must be fixed before it is sent, the job an
 * agreement from the catalogue gives, and the words for why a company is listed. Pure functions, tested without
 * rendering.
 */
import type { SupplierCpvKind, SupplierMatch, SupplierSearch, UpcomingProcurement } from "../../api/types";
import { plural, splitList } from "../../lib/format";
import { CPV_CODE } from "./NewNoticeDialog";

export interface JobDraft {
  title: string;
  description: string;
  /** CPV codes as typed, comma-separated (as in "Ny upphandling"). */
  cpv: string;
}

export const EMPTY_JOB: JobDraft = { title: "", description: "", cpv: "" };

/** The backend's limits (api/schemas.py SupplierSearch). */
const TITLE_MAX = 500;
const DESCRIPTION_MAX = 8000;
const CPV_MAX = 30;
/** Less text than this, and no CPV code, gives nothing to match on. */
const MIN_TEXT = 3;

/** The agreement catalogue as far as the API reads it, so every agreement that is coming up is offered. */
export const CATALOGUE_MONTHS = 36;

export type JobField = "title" | "description" | "cpv";

/** What must be fixed before the job can be sent, per field. */
export function jobErrors(draft: JobDraft): Partial<Record<JobField, string>> {
  const errors: Partial<Record<JobField, string>> = {};
  const title = draft.title.trim();
  const description = draft.description.trim();
  const codes = splitList(draft.cpv);
  if (codes.length === 0 && `${title} ${description}`.trim().length < MIN_TEXT) {
    errors.title = "Beskriv uppdraget eller ange minst en CPV-kod.";
  } else if (title.length > TITLE_MAX) {
    errors.title = `Rubriken får vara högst ${TITLE_MAX} tecken.`;
  }
  if (description.length > DESCRIPTION_MAX) errors.description = `Beskrivningen får vara högst ${DESCRIPTION_MAX} tecken.`;
  const wrong = codes.filter((code) => !CPV_CODE.test(code));
  if (wrong.length > 0) errors.cpv = `${wrong.join(", ")} är inte en CPV-kod. En kod har åtta siffror, till exempel 45442100.`;
  else if (codes.length > CPV_MAX) errors.cpv = `Ange högst ${CPV_MAX} CPV-koder.`;
  return errors;
}

export function jobRequest(draft: JobDraft): SupplierSearch {
  return { title: draft.title.trim(), description: draft.description.trim(), cpv_codes: splitList(draft.cpv) };
}

/** The job as the catalogue describes the procurement that is coming: the title, the codes and what was required last time. */
export function jobFromUpcoming(item: UpcomingProcurement): JobDraft {
  return { title: item.title, description: item.previous_requirements ?? "", cpv: item.cpv_codes.join(", ") };
}

/** How close the company's nearest CPV code is to the job's, in the buyer's words. */
export const CPV_MATCH_LABEL: Record<SupplierCpvKind, string> = {
  same_code: "Samma kod",
  same_category: "Samma kategori",
  same_group: "Samma grupp",
};

/** "Sundsvall, Timrå · 5 anställda", or whichever of the two the profile gives; empty when neither. */
export function companyFacts(item: Pick<SupplierMatch, "municipalities" | "employees">): string {
  return [
    item.municipalities.length > 0 ? item.municipalities.join(", ") : null,
    item.employees === null ? null : plural(item.employees, "anställd", "anställda"),
  ]
    .filter(Boolean)
    .join(" · ");
}

const listFormat = new Intl.ListFormat("sv-SE", { type: "conjunction" });

/** "Beskrivningen nämner fasader och tapetserar": the company's own words that the job also has; null without any. */
export function sharedWordsText(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  return `Beskrivningen nämner ${listFormat.format(words)}`;
}

/** "3 företag verkar kunna svara": the rule finds likely bidders, it does not promise any. */
export function resultHeading(count: number): string {
  return `${plural(count, "företag", "företag")} verkar kunna svara`;
}
