/**
 * The company profile form's model (direction.md, section 4 "Företagsprofil"): what the form edits, what the backend
 * takes, whether anything is unsaved, and the plain-language pieces (CPV codes named first, never a bare code).
 * Pure functions, so the rules are tested without rendering.
 */
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import type { CompanyUpdate, CompanyView, MatchView } from "../../api/types";
import { formatNumber, plural } from "../../lib/format";

/** The backend's limits (CompanyUpdate in api/schemas.py and CpvSuggestionRequest). */
export const LIMITS = {
  description: 4000,
  /** A description shorter than this gives the CPV suggestion nothing to go on. */
  suggestFrom: 10,
  cpv: 30,
  municipalities: 20,
  certifications: 20,
  insurance: 500,
  references: 2000,
} as const;

/** What the form holds: the profile's fields as the controls edit them. */
export interface ProfileDraft {
  description: string;
  /** The chosen CPV codes as chips: `id` is the code, `label` names it first ("Målning · 45442100"). */
  cpv: SearchableItem[];
  municipalities: string[];
  employees: number | null;
  turnover: number | null;
  certifications: string[];
  insurance: string;
  references: string;
}

/** "Målning · 45442100": the name a reader knows, then the code. An unnamed code still says what it is. */
export function cpvChipLabel(code: string, label: string | undefined): string {
  return `${label?.trim() || "Kod utan benämning"} · ${code}`;
}

export function cpvChip(code: string, label: string | undefined): SearchableItem {
  return { id: code, label: cpvChipLabel(code, label) };
}

export function draftFromProfile(profile: CompanyView): ProfileDraft {
  return {
    description: profile.description,
    cpv: profile.cpv_codes.map((code) => cpvChip(code, profile.cpv_labels[code])),
    municipalities: profile.municipalities,
    employees: profile.employees,
    turnover: profile.annual_turnover_sek,
    certifications: profile.certifications,
    insurance: profile.insurance ?? "",
    references: profile.public_references ?? "",
  };
}

/** The request body, trimmed the way the backend stores it. */
export function toUpdate(draft: ProfileDraft): CompanyUpdate {
  return {
    description: draft.description.trim(),
    cpv_codes: draft.cpv.map((item) => item.id),
    municipalities: draft.municipalities.map((value) => value.trim()).filter(Boolean),
    employees: draft.employees,
    annual_turnover_sek: draft.turnover,
    certifications: draft.certifications.map((value) => value.trim()).filter(Boolean),
    insurance: draft.insurance.trim() || null,
    public_references: draft.references.trim() || null,
  };
}

/** Whether the form says anything the saved profile does not: then "Spara" stays in view (sticky). */
export function hasUnsavedChanges(draft: ProfileDraft, saved: CompanyView): boolean {
  return JSON.stringify(toUpdate(draft)) !== JSON.stringify(toUpdate(draftFromProfile(saved)));
}

export type DraftField = "description" | "insurance" | "references";

/** What stops the profile from being saved, per field, in the reader's words. */
export function draftErrors(draft: ProfileDraft): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {};
  if (draft.description.length > LIMITS.description) {
    errors.description = `Beskrivningen får vara högst ${formatNumber(LIMITS.description)} tecken.`;
  }
  if (draft.insurance.length > LIMITS.insurance) {
    errors.insurance = `Försäkringarna får beskrivas med högst ${formatNumber(LIMITS.insurance)} tecken.`;
  }
  if (draft.references.length > LIMITS.references) {
    errors.references = `Uppdragen får beskrivas med högst ${formatNumber(LIMITS.references)} tecken.`;
  }
  return errors;
}

/**
 * The matches Start shows as cards: those that seem to fit or fit in part, as the backend counts `fitting_notices`
 * after a save (matching.FITTING). GET /api/matches also lists the ones that do not seem to fit.
 */
export function fittingMatchCount(matches: readonly Pick<MatchView, "fit">[]): number {
  return matches.filter((match) => match.fit === "passar" || match.fit === "passar_delvis").length;
}

/** "Just nu: 2 träffar", "Just nu: 1 träff" or "Inga träffar just nu". */
export function matchCountText(count: number): string {
  if (count === 0) return "Inga träffar just nu";
  return `Just nu: ${plural(count, "träff", "träffar")}`;
}

const NBSP = "\u00a0";

/**
 * The toast after a save (direction.md, section 4 "Företagsprofil"): "Profilen är sparad · 2 upphandlingar verkar
 * passa er". The count is null when the matches are assessed anew after the answer (a language model), and Start
 * then has them a little later. The toast is narrow, so no-break spaces keep the dot with "sparad", the number with
 * its noun and the last word with the one before it.
 */
export function savedMessage(fittingNotices: number | null): string {
  const saved = `Profilen är sparad${NBSP}·`;
  if (fittingNotices === null) return `${saved} Träffarna uppdateras om en${NBSP}stund`;
  if (fittingNotices === 0) return `${saved} Inga öppna upphandlingar verkar passa er just${NBSP}nu`;
  const noun = fittingNotices === 1 ? "upphandling" : "upphandlingar";
  return `${saved} ${formatNumber(fittingNotices)}${NBSP}${noun} verkar passa${NBSP}er`;
}

/** The municipalities of Västernorrland, offered first; any other place can be typed. */
export const NEARBY_MUNICIPALITIES: readonly string[] = [
  "Sundsvall",
  "Timrå",
  "Härnösand",
  "Ånge",
  "Kramfors",
  "Sollefteå",
  "Örnsköldsvik",
];

/** Chips for a list of words, where the word is both the id and the name. */
export function wordChips(values: readonly string[]): SearchableItem[] {
  return values.map((value) => ({ id: value, label: value }));
}

/**
 * A chip as the profile stores it: the word itself. The free-text entry is offered as "Lägg till ”X”" (Astryx's
 * own entry says "Create" in English), with the word as its id.
 */
export function chipValues(items: readonly SearchableItem[]): string[] {
  return items.map((item) => item.id);
}

/**
 * A search for a Tokenizer of words: the known words that match, then the typed word itself unless it is already
 * known or chosen.
 */
export function wordSource(known: readonly string[]): SearchSource<SearchableItem> {
  return {
    search: (query) => {
      const typed = query.trim();
      const lower = typed.toLocaleLowerCase("sv");
      const matches = known.filter((word) => word.toLocaleLowerCase("sv").includes(lower));
      const isKnown = known.some((word) => word.toLocaleLowerCase("sv") === lower);
      const items = matches.map((word) => ({ id: word, label: word }));
      return typed && !isKnown ? [...items, { id: typed, label: `Lägg till ”${typed}”` }] : items;
    },
    bootstrap: () => known.map((word) => ({ id: word, label: word })),
  };
}
