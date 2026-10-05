/**
 * Splits a text around the procurement terms the checklist explains, so each term can be clicked for its
 * explanation. Only the first occurrence of each term in a text is marked: one explanation per paragraph
 * is help, every repetition underlined is noise.
 */

export interface TermSegment {
  text: string;
  /** The explained term this segment is an occurrence of, as the checklist spells it. */
  term?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitByTerms(text: string, terms: readonly string[]): TermSegment[] {
  const usable = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  if (usable.length === 0 || !text) return text ? [{ text }] : [];

  // Whole words only: "ESPD" must not match inside another word. Longest terms first, so a compound
  // ("ekonomisk stabilitet") wins over a part of it ("stabilitet").
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${usable.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const byLowerCase = new Map(usable.map((term) => [term.toLocaleLowerCase("sv"), term]));
  const seen = new Set<string>();
  const segments: TermSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const term = byLowerCase.get(match[0].toLocaleLowerCase("sv"));
    if (!term || seen.has(term) || match.index === undefined) continue;
    seen.add(term);
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
    segments.push({ text: match[0], term });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
