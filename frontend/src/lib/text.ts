/** Small text helpers shared by rows that show a title and a body. */

/**
 * The text with its numbers kept whole: the space between digit groups becomes a no-break space, so "5 000 000
 * kronor" never breaks inside the number. Swedish typography writes it so, and Intl formats our own numbers the same.
 */
export function keepNumbersTogether(text: string): string {
  return text.replace(/(?<=\d) (?=\d{3}(?!\d))/gu, "\u00a0");
}

/**
 * A text reduced to what a reader compares: one case, single spaces, and no closing full stop, ellipsis or
 * quotation marks. "Anbudet är skrivet på svenska." and "anbudet är skrivet på svenska" are the same.
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLocaleLowerCase("sv")
    .replace(/[”“"'’]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/(?:\.{3}|…|[.!?:;])+$/u, "")
    .trim();
}

/**
 * Whether a body says more than its title. The extracted plain-language text often repeats the title word for
 * word; then only the title is shown (direction.md, section 9.4).
 */
export function bodyAddsToTitle(title: string, body: string | null | undefined): body is string {
  if (!body || !body.trim()) return false;
  return normalizeForComparison(body) !== normalizeForComparison(title);
}

const ELLIPSIS_END = /\s*(?:\.{3}|…)\s*$/u;
// A sentence ends at a full stop before a capital or the end, so "19 kap. 2 §" does not end one.
const SENTENCE_END = /[.!?](?=\s+[\p{Lu}"”(]|\s*$)/gu;

/**
 * The title and the body a row shows, without saying anything twice. Extraction often makes the title the start of
 * the body: then a title cut off with "…" gives way to the body's whole first sentence, and a body that only
 * continues the title shows just its continuation. A body that only repeats the title is dropped.
 */
export function splitTitleAndBody(title: string, body: string | null | undefined): { title: string; body: string | null } {
  const shownTitle = title.trim();
  const text = body?.trim() ?? "";
  if (!bodyAddsToTitle(shownTitle, text)) return { title: shownTitle, body: null };

  const lowerText = text.toLocaleLowerCase("sv");
  if (ELLIPSIS_END.test(shownTitle)) {
    const prefix = shownTitle.replace(ELLIPSIS_END, "").toLocaleLowerCase("sv");
    if (prefix && lowerText.startsWith(prefix)) {
      SENTENCE_END.lastIndex = prefix.length;
      const end = SENTENCE_END.exec(text);
      const sentenceEnd = end ? end.index + 1 : text.length;
      const rest = text.slice(sentenceEnd).trim();
      return { title: text.slice(0, sentenceEnd).trim(), body: rest || null };
    }
  }
  const lowerTitle = shownTitle.replace(/[.!?]+$/u, "").toLocaleLowerCase("sv");
  if (lowerText.startsWith(lowerTitle)) {
    const rest = text.slice(lowerTitle.length).replace(/^[\s.,;:!?–-]+/u, "").trim();
    return { title: shownTitle, body: rest ? rest.charAt(0).toLocaleUpperCase("sv") + rest.slice(1) : null };
  }
  return { title: shownTitle, body: text };
}
