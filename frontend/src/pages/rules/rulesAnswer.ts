/**
 * Regelhjälpen's answer as the page shows it (direction.md, section 4 "Regelhjälpen"): a bold one-sentence conclusion
 * when the engine wrote one, the explanation, and one card per paragraph the answer rests on. Pure functions, so the
 * reading of the engines' texts is tested without rendering.
 */
import type { RuleSource, RuleSourceKind, RulesAnswer, RulesView } from "../../api/types";
import { formatNumber } from "../../lib/format";

export interface RulesAnswerParts {
  /** The one-sentence conclusion the answer opens with, shown in bold; null when it opens with a list. */
  lead: string | null;
  /** The rest of the explanation, as Markdown (a language model may write lists); empty when there is none. */
  body: string;
  /** The engine's own line before the paragraphs ("Paragrafer som kan handla om din fråga:"), when it wrote one. */
  sourcesIntro: string | null;
}

const PARAGRAPH_BREAK = /\n\s*\n/u;
const LIST_LINE = /^\s*(?:[-–•*]|\d+[.)])\s+/u;
// A sentence ends at a full stop before a capital or the end, so "20 kap. 1 §" does not end one (lib/text.ts).
const SENTENCE_END = /[.!?](?=\s+[\p{Lu}"”(]|\s*$)/u;
const BOLD_MARKS = /\*\*|__/gu;
const LEADING_BOLD = /^\*\*(.+?)\*\*/u;

function collapse(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** "LOU 20 kap. 1 § – Avtalsspärr: Om en upphandlande …": the rule-based engine's line for a source it also lists. */
function echoesSource(paragraph: string, sources: readonly RuleSource[]): boolean {
  const text = collapse(paragraph);
  return sources.some(
    (source) =>
      Boolean(source.reference && source.excerpt) &&
      text === collapse(`${source.reference} – ${source.title}: ${source.excerpt}`),
  );
}

/** The first sentence of a text and what follows it. */
export function splitFirstSentence(text: string): { first: string; rest: string } {
  const end = SENTENCE_END.exec(text);
  if (!end) return { first: text.trim(), rest: "" };
  return { first: text.slice(0, end.index + 1).trim(), rest: text.slice(end.index + 1).trim() };
}

/**
 * Reads an answer into what the page shows. The rule-based engine repeats every paragraph it lists in the text
 * ("LOU 20 kap. 1 § – Avtalsspärr: …"), so those lines are dropped: the cards show them once. A text that is then
 * only an introduction ending in ":" introduces the cards. Otherwise the first sentence is the lead, because the
 * prompt asks a language model to open with its conclusion in one sentence.
 */
export function parseRulesAnswer(answer: Pick<RulesAnswer, "answer" | "sources">): RulesAnswerParts {
  const paragraphs = answer.answer
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !echoesSource(paragraph, answer.sources));

  const [first, ...others] = paragraphs;
  if (first === undefined) return { lead: null, body: "", sourcesIntro: null };
  if (others.length === 0 && answer.sources.length > 0 && !first.includes("\n") && /:\s*$/u.test(first)) {
    return { lead: null, body: "", sourcesIntro: collapse(first) };
  }
  if (LIST_LINE.test(first)) return { lead: null, body: paragraphs.join("\n\n"), sourcesIntro: null };

  // The lead comes from the first line only, so a list that follows it stays a list. A model may already have put
  // its conclusion in bold; the page does that itself.
  const lineBreak = first.indexOf("\n");
  const firstLine = (lineBreak === -1 ? first : first.slice(0, lineBreak)).replace(LEADING_BOLD, "$1");
  const restOfParagraph = lineBreak === -1 ? "" : first.slice(lineBreak + 1);
  const { first: lead, rest } = splitFirstSentence(firstLine);
  const opening = [rest, restOfParagraph].filter(Boolean).join("\n");
  return {
    lead: collapse(lead.replace(BOLD_MARKS, "")),
    body: [opening, ...others].filter(Boolean).join("\n\n"),
    sourcesIntro: null,
  };
}

/** "LOU 20 kap. 1 § · Avtalsspärr": the reference and the paragraph's name, either alone when that is all there is. */
export function sourceTitle(source: Pick<RuleSource, "reference" | "title">): string {
  const reference = source.reference?.trim();
  const title = source.title.trim();
  if (!reference) return title;
  if (!title || title === reference) return reference;
  return `${reference} · ${title}`;
}

export type SourceKind = RuleSourceKind | "other";

/**
 * What a source is: a paragraph of the law, a section of one of the municipality's steering documents (decision
 * 0022), or something else (guidance, a web page). The backend says which; an older answer without `kind` is read
 * from its reference.
 */
export function sourceKind(source: Pick<RuleSource, "reference" | "kind">): SourceKind {
  if (source.kind) return source.kind;
  return source.reference?.startsWith("LOU") ? "law" : "other";
}

/** A paragraph of the law (LOU), as opposed to a steering document, guidance or a web page. */
export function isLawSource(source: Pick<RuleSource, "reference" | "kind">): boolean {
  return sourceKind(source) === "law";
}

/** "Läs hela paragrafen" for the law, "Läs hela avsnittet" for a steering document, else "Läs källan". */
export function sourceLinkLabel(source: Pick<RuleSource, "reference" | "kind">): string {
  const kind = sourceKind(source);
  if (kind === "law") return "Läs hela paragrafen";
  if (kind === "policy") return "Läs hela avsnittet";
  return "Läs källan";
}

/** The heading over the cards: the engine's own introduction, else a plain one; a heading, so without its colon. */
export function sourcesHeading(parts: Pick<RulesAnswerParts, "sourcesIntro">): string {
  return (parts.sourcesIntro ?? "Svaret bygger på").replace(/:\s*$/u, "");
}

/**
 * An answer from a language model with no source is flagged; the rule-based engine's answer without sources says
 * itself that it found no rule, so it needs no warning.
 */
export function needsSourceWarning(view: Pick<RulesView, "engine" | "answer">): boolean {
  return view.answer.sources.length === 0 && view.engine !== "heuristic";
}

export const MIN_QUESTION_LENGTH = 3;
export const MAX_QUESTION_LENGTH = 2000;

/** What is wrong with a question before it is sent, in the reader's words; null when it can be sent. */
export function questionError(question: string): string | null {
  const length = question.trim().length;
  if (length < MIN_QUESTION_LENGTH) return "Skriv en fråga på minst tre tecken";
  if (length > MAX_QUESTION_LENGTH) return `Frågan får vara högst ${formatNumber(MAX_QUESTION_LENGTH)} tecken`;
  return null;
}

/**
 * Questions most companies have; they stay below the conversation (direction.md: "Exempelfrågorna ligger kvar").
 * Short enough for one line on a phone, and worded as the law is, so that even the rule-based engine, which looks
 * for the question's words in LOU, finds the right paragraphs (checked against the demo's LOU on 2026-10-05).
 */
export const EXAMPLE_QUESTIONS: readonly string[] = [
  "Hur lång är avtalsspärren?",
  "Vad är en direktupphandling?",
  "Vad är ett kvalificeringskrav?",
  "Hur begär vi överprövning?",
];

/** The address parameter that asks a question on arrival ("/regelhjalpen?fraga=…"), e.g. from Start. */
export const QUESTION_PARAM = "fraga";

/** The conversation to continue: the latest answer's session, since a language model keeps the thread there. */
export function latestSessionId(views: readonly (RulesView | null)[]): string | null {
  for (let index = views.length - 1; index >= 0; index -= 1) {
    const sessionId = views[index]?.answer.session_id;
    if (sessionId) return sessionId;
  }
  return null;
}
