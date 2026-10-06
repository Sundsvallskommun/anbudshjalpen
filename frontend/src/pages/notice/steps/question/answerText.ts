/**
 * An answer's text split into what the thread shows: a bold lead sentence and the paragraphs after it (direction.md,
 * section 4 "Steg 2 Fråga"). The citations are shown as their own list with their pages, so the lines the rule-based
 * engine writes for them ("– … (sida 5)") are left out of the text, and so is its closing advice when the answer was
 * not in the document: the advice box beside it says the same with the date.
 */
import type { Answer } from "../../../../api/types";
import { normalizeForComparison } from "../../../../lib/text";

/** The rule-based engine's first line, which only says that quotes follow (backend ai/heuristic.ANSWER_LEAD). */
export const QUOTES_LEAD = "Det här står i underlaget:";

/** The rule-based engine's advice after "Inget i underlaget verkar besvara frågan." */
const NOT_FOUND_ADVICE = "Ställ frågan i e-Avrop före sista dag för frågor, så får alla leverantörer samma svar.";

const CITATION_LINE = /^\s*[–-]\s+.*\(sida\s+\d+\)\s*$/u;
// A sentence ends at . ! or ? before a capital letter or the end of the text, but not after an abbreviation: "19 kap.
// LOU" and "t.ex. Matfors" go on.
const SENTENCE_END = /[.!?](?=\s+[\p{Lu}"”(]|\s*$)/gu;
const ABBREVIATION = /(?:^|[\s(])(kap|kl|nr|ca|jfr|inkl|exkl|resp|s|st|t\.ex|bl\.a|dvs|m\.m|p)$/iu;

export interface AnswerParts {
  /** The conclusion in one sentence, or null when the answer has none (the rule-based engine's quotes only). */
  lead: string | null;
  paragraphs: string[];
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .filter((line) => !CITATION_LINE.test(line))
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter(Boolean);
}

function firstSentence(paragraph: string): { sentence: string; rest: string } {
  for (const end of paragraph.matchAll(SENTENCE_END)) {
    if (end[0] === "." && ABBREVIATION.test(paragraph.slice(0, end.index))) continue;
    return { sentence: paragraph.slice(0, end.index + 1).trim(), rest: paragraph.slice(end.index + 1).trim() };
  }
  return { sentence: paragraph, rest: "" };
}

function isSame(text: string, other: string): boolean {
  return normalizeForComparison(text) === normalizeForComparison(other);
}

export function answerParts(answer: Pick<Answer, "answer" | "found_in_document">): AnswerParts {
  const [first, ...others] = paragraphsOf(answer.answer);
  if (!first) return { lead: null, paragraphs: [] };
  const opening = isSame(first, QUOTES_LEAD) ? null : firstSentence(first.startsWith(QUOTES_LEAD) ? first.slice(QUOTES_LEAD.length).trim() : first);
  const rest = [opening?.rest ?? "", ...others].filter(Boolean);
  const paragraphs = answer.found_in_document ? rest : rest.filter((paragraph) => !isSame(paragraph, NOT_FOUND_ADVICE));
  return { lead: opening?.sentence || null, paragraphs };
}

/** A quote as the claim its source link names: the first words, so every link's name stays short and unique. */
export function quoteClaim(quote: string, maxWords = 8): string {
  const words = quote.trim().split(/\s+/u);
  return words.length <= maxWords + 2 ? words.join(" ") : `${words.slice(0, maxWords).join(" ")} …`;
}
