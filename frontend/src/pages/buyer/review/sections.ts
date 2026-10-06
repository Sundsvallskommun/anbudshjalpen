/**
 * Where things stand in the document: the numbered section heading above a requirement's quote on the page
 * ("2 Kvalificering") and the kind of requirement such a heading announces, which the automatic check "kravtyp som
 * inte stämmer med avsnittets rubrik" (direction.md, section 4) compares, and the heading that says how tenders are
 * evaluated. Pure functions, tested without rendering.
 */
import type { RequirementKind } from "../../../api/types";
import { findQuote } from "../../../lib/highlight";
import { isSectionHeading } from "../../../lib/pageText";

/**
 * The heading words that announce a kind of requirement, checked in this order: "Krav på anbudsgivaren" is about the
 * company, "Avtalsvillkor för uppdraget" about the contract. Only clear headings count; anything else says nothing.
 */
const KIND_HEADINGS: readonly [RequirementKind, RegExp][] = [
  [
    "kvalificeringskrav",
    /kvalificering|krav på (?:leverantören|anbudsgivaren)|leverantörskrav|uteslutning|lämplighet|ekonomisk och finansiell|teknisk och yrkesmässig/iu,
  ],
  ["avtalsvillkor", /avtalsvillkor|kommersiella villkor|allmänna villkor|särskilda villkor|villkor för avtalet/iu],
  [
    "skallkrav",
    /skall-?krav|obligatoriska krav|krav på anbudet|anbudets (?:form|innehåll|utformning)|administrativa (?:krav|föreskrifter|bestämmelser)/iu,
  ],
  [
    "krav_pa_uppdraget",
    /kravspecifikation|uppdragsbeskrivning|tjänstebeskrivning|krav på (?:tjänsten|varan|varorna|leveransen|utförandet)|uppdraget|leveransvillkor/iu,
  ],
];

/** The kind of requirement a section heading announces, or null when it does not say. */
export function expectedKind(heading: string): RequirementKind | null {
  for (const [kind, pattern] of KIND_HEADINGS) {
    if (pattern.test(heading)) return kind;
  }
  return null;
}

/**
 * The last numbered section heading before the quote on its page, or null when the quote is not on the page or no
 * heading stands above it there.
 */
export function headingAbove(pageText: string, quote: string): string | null {
  const range = findQuote(pageText, quote);
  if (!range) return null;
  let heading: string | null = null;
  let offset = 0;
  for (const line of pageText.split("\n")) {
    if (offset >= range.start) break;
    if (isSectionHeading(line)) heading = line.trim();
    offset += line.length + 1;
  }
  return heading;
}

export interface KindMismatch {
  /** The heading the requirement stands under: "2 Kvalificering". */
  heading: string;
  /** The kind the heading announces. */
  expected: RequirementKind;
}

/** Whether a requirement's kind disagrees with the heading it stands under; null when they agree or nothing is known. */
export function kindMismatch(kind: RequirementKind, heading: string | null): KindMismatch | null {
  if (!heading) return null;
  const expected = expectedKind(heading);
  if (!expected || expected === kind) return null;
  return { heading, expected };
}

/** A numbered heading of the document and the page it stands on ("4 Utvärdering", page 6). */
export interface DocumentHeading {
  heading: string;
  page: number;
}

const EVALUATION_HEADING = /utvärdering|tilldelningsgrund|grund för tilldelning/iu;
/** A table-of-contents line: the heading followed by its page number ("4 Utvärdering 6"). */
const CONTENTS_LINE = /\s\d{1,3}$/u;

/**
 * Where the document says how tenders are evaluated: the first numbered heading about evaluation, in page order, among
 * the pages read so far. The automatic check names it when the checklist has no evaluation criteria (direction.md,
 * section 4: "utvärderingskriterier som saknas").
 */
export function evaluationHeading(texts: ReadonlyMap<number, string>): DocumentHeading | null {
  const pages = [...texts.keys()].sort((a, b) => a - b);
  for (const page of pages) {
    for (const line of texts.get(page)?.split("\n") ?? []) {
      const heading = line.trim();
      if (isSectionHeading(heading) && EVALUATION_HEADING.test(heading) && !CONTENTS_LINE.test(heading)) {
        return { heading, page };
      }
    }
  }
  return null;
}

/** What a heading is called in a sentence: "kapitlet 4 Utvärdering", "avsnittet 4.2 Utvärderingsmodell". */
export function headingNoun(heading: string): "kapitlet" | "avsnittet" {
  return /^\d{1,2}\.?\s/u.test(heading) ? "kapitlet" : "avsnittet";
}
