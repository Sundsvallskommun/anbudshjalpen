/**
 * A document page's extracted text laid out as paper: section headings ("3.4 Ansvarsförsäkring") and paragraphs,
 * with the cited quote marked. The extraction keeps the PDF's line breaks, so lines are joined into paragraphs again:
 * a paragraph ends at a blank line, a heading, a list item, or a line that ends a sentence before one that starts
 * with a capital. Joining replaces a line break with a space, one character for one, so the quote's range in the
 * original text (lib/highlight) still points at the right characters.
 */
import type { TextRange } from "./highlight";

export interface PagePiece {
  text: string;
  isMatch: boolean;
}

export interface PageBlock {
  kind: "heading" | "paragraph";
  /** The block's text in order, its line breaks joined. */
  pieces: PagePiece[];
}

/**
 * A numbered section heading on a line of its own: "3.4 Ansvarsförsäkring", "1 Allmänt". The number is followed by
 * a capital letter, so a wrapped line that starts with an amount ("5 000 000 kronor …") is not a heading, and a
 * heading is short and does not end like a sentence.
 */
const HEADING = /^\d{1,2}(?:\.\d{1,2}){0,3}\.?\s+\p{Lu}[^\n]{0,78}$/u;
const LIST_ITEM = /^\s*(?:[•◦▪‣●■–-]|\d{1,2}[.)])\s/u;
const ENDS_SENTENCE = /[.!?:;][)”"’]?\s*$/u;
const STARTS_SENTENCE = /^\s*[\p{Lu}\d"”“(]/u;

export function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  return HEADING.test(trimmed) && !/[.,;:]$/u.test(trimmed);
}

interface Span {
  kind: PageBlock["kind"];
  start: number;
  end: number;
}

/** Whether `line` starts a new paragraph after `previous` (both non-empty lines of running text). */
function startsParagraph(previous: string, line: string): boolean {
  return LIST_ITEM.test(line) || (ENDS_SENTENCE.test(previous) && STARTS_SENTENCE.test(line));
}

/** The blocks of a page as ranges of its text. */
function blockSpans(text: string): Span[] {
  const spans: Span[] = [];
  let paragraph: Span | null = null;
  let previous = "";
  let offset = 0;
  for (const line of text.split("\n")) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (!line.trim()) {
      paragraph = null;
      continue;
    }
    if (isSectionHeading(line)) {
      spans.push({ kind: "heading", start, end });
      paragraph = null;
      continue;
    }
    if (paragraph && !startsParagraph(previous, line)) {
      paragraph.end = end;
    } else {
      paragraph = { kind: "paragraph", start, end };
      spans.push(paragraph);
    }
    previous = line;
  }
  return spans;
}

/** A paragraph's own line breaks as spaces: the same length, so ranges in the original text still fit. */
function joinLines(text: string): string {
  return text.replace(/\n/gu, " ");
}

function piecesOf(text: string, span: Span, range: TextRange | null): PagePiece[] {
  const from = range ? Math.max(span.start, range.start) : span.end;
  const to = range ? Math.min(span.end, range.end) : span.end;
  const pieces =
    from >= to
      ? [{ text: text.slice(span.start, span.end), isMatch: false }]
      : [
          { text: text.slice(span.start, from), isMatch: false },
          { text: text.slice(from, to), isMatch: true },
          { text: text.slice(to, span.end), isMatch: false },
        ];
  return pieces.filter((piece) => piece.text.length > 0).map((piece) => ({ ...piece, text: joinLines(piece.text) }));
}

/** The page as blocks, with the quote's range marked wherever it falls. */
export function layoutPage(text: string, range: TextRange | null): PageBlock[] {
  return blockSpans(text).map((span) => ({ kind: span.kind, pieces: piecesOf(text, span, range) }));
}
