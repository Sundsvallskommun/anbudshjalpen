/**
 * Finds a citation's quote in a page's text so the page viewer can mark it.
 *
 * The backend verifies every quote against the page (backend/src/anbudsklar/documents/citations.py). A quote
 * it counts as found must be markable here too, or the viewer would say "verifierat" and mark nothing. So
 * this follows the same rules, on a matching key that remembers where each of its characters came from:
 *
 * - Diacritics, compatibility forms and case are folded ("Leverantoren" finds "Leverantören").
 * - Quotation marks (also « ») and invisible characters are dropped, typographic dashes become "-", and
 *   bullets and all whitespace are ignored.
 * - A hyphen between two letters is ignored together with a following line break ("kvalifi-\nceringskrav").
 * - An ellipsis ("…", "...", "[…]") splits the quote into parts that must appear in order, close together.
 * - When nothing matches exactly, a part of 20 characters or more may match approximately (at least 90 of
 *   100, as the backend's fuzzy match), but only if it has the same numbers: "60 dagar" never marks "90 dagar".
 *
 * The match is a range in the original page text, from the first part's start to the last part's end.
 */

export interface TextRange {
  start: number;
  end: number;
}

export interface TextSegment {
  text: string;
  isMatch: boolean;
}

const FUZZY_THRESHOLD = 90;
const FUZZY_MIN_CHARS = 20;
const ELLIPSIS_MAX_GAP = 400;
const MIN_QUOTE_CHARS = 3;

const INVISIBLE = "­​‌‍⁠﻿";
const QUOTES = "\"'`´‘’‚‛“”„‟«»‹›′″";
const QUOTE_CHARS = new Set(Array.from(QUOTES));
const DROPPED = new Set(Array.from(INVISIBLE + QUOTES));
const DASHES = new Set(Array.from("‐‑‒–—―−﹘﹣－"));
const BULLETS = new Set(Array.from("•◦▪▫‣⁃●○■□▸►✓✔∙·"));

const COMBINING = /\p{M}/u;
const COMBINING_ALL = /\p{M}/gu;
const SPACE_CHAR = /^\s$/u;
const HYPHEN_JOIN = /(?<=[\p{L}\p{N}_])-\s*(?=[\p{L}\p{N}_])/gu;
const WHITESPACE = /\s+/gu;
const SPACES = / /gu;
const ELLIPSIS = /\s*(?:[[(]\s*(?:…|\.{3})\s*[\])]|…|\.{3,})\s*/u;
const NUMBER = /\d+/gu;

/** Matching-key text and, for each of its UTF-16 units, the index in the original text it came from. */
interface Folded {
  text: string;
  origin: number[];
}

interface Hit {
  start: number;
  end: number;
}

const foldCache = new Map<string, string>();

function foldChar(char: string): string {
  const cached = foldCache.get(char);
  if (cached !== undefined) return cached;
  let folded: string;
  if (DROPPED.has(char)) folded = "";
  else if (DASHES.has(char)) folded = "-";
  else if (BULLETS.has(char) || SPACE_CHAR.test(char)) folded = " ";
  else folded = char.normalize("NFKD").toLowerCase().replace(COMBINING_ALL, "");
  foldCache.set(char, folded);
  return folded;
}

function substitute(folded: Folded, pattern: RegExp, replacement: string): Folded {
  let text = "";
  const origin: number[] = [];
  let last = 0;
  const keep = (from: number, to: number) => {
    text += folded.text.slice(from, to);
    for (let index = from; index < to; index += 1) origin.push(folded.origin[index]!);
  };
  for (const match of folded.text.matchAll(pattern)) {
    keep(last, match.index);
    text += replacement;
    for (let index = 0; index < replacement.length; index += 1) origin.push(folded.origin[match.index]!);
    last = match.index + match[0].length;
  }
  keep(last, folded.text.length);
  return { text, origin };
}

/** The compact matching key: folded, dehyphenated and without any whitespace. */
function compact(text: string): Folded {
  let folded = "";
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = foldChar(char);
    folded += part;
    for (let unit = 0; unit < part.length; unit += 1) origin.push(index);
    index += char.length;
  }
  return substitute(substitute(substitute({ text: folded, origin }, HYPHEN_JOIN, ""), WHITESPACE, " "), SPACES, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function exactHit(text: string, parts: string[]): Hit | null {
  const pattern = new RegExp(parts.map(escapeRegExp).join(`[\\s\\S]{0,${ELLIPSIS_MAX_GAP}}?`), "u");
  const match = pattern.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * The substring of `haystack` closest to `needle` (insertions and deletions cost 1, as in the backend's
 * rapidfuzz ratio): what to mark. Its score only picks the best end; `windowRatio` decides whether it counts.
 */
function bestAlignment(needle: string, haystack: string): { score: number; start: number; end: number } | null {
  const width = haystack.length + 1;
  let previousCost = new Int32Array(width);
  let previousStart = Int32Array.from({ length: width }, (_, column) => column);
  let currentCost = new Int32Array(width);
  let currentStart = new Int32Array(width);
  for (let row = 1; row <= needle.length; row += 1) {
    const char = needle.charCodeAt(row - 1);
    currentCost[0] = row;
    currentStart[0] = 0;
    for (let column = 1; column < width; column += 1) {
      let cost = previousCost[column - 1]! + (char === haystack.charCodeAt(column - 1) ? 0 : 2);
      let start = previousStart[column - 1]!;
      if (previousCost[column]! + 1 < cost) {
        cost = previousCost[column]! + 1;
        start = previousStart[column]!;
      }
      if (currentCost[column - 1]! + 1 < cost) {
        cost = currentCost[column - 1]! + 1;
        start = currentStart[column - 1]!;
      }
      currentCost[column] = cost;
      currentStart[column] = start;
    }
    [previousCost, currentCost] = [currentCost, previousCost];
    [previousStart, currentStart] = [currentStart, previousStart];
  }
  let best: { score: number; start: number; end: number } | null = null;
  for (let column = 1; column < width; column += 1) {
    const start = previousStart[column]!;
    const length = needle.length + column - start;
    const score = 100 * (1 - previousCost[column]! / length);
    if (!best || score > best.score) best = { score, start, end: column };
  }
  return best;
}

function lcsLength(a: string, b: string): number {
  let previous = new Int32Array(b.length + 1);
  let current = new Int32Array(b.length + 1);
  for (let row = 1; row <= a.length; row += 1) {
    const char = a.charCodeAt(row - 1);
    for (let column = 1; column <= b.length; column += 1) {
      current[column] =
        char === b.charCodeAt(column - 1) ? previous[column - 1]! + 1 : Math.max(previous[column]!, current[column - 1]!);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}

/**
 * The backend's score for an approximate match (rapidfuzz `partial_ratio`): `needle` against windows of
 * its own length, here the windows that start, end and centre on the aligned passage.
 */
function windowRatio(needle: string, haystack: string, start: number, end: number): number {
  const length = needle.length;
  const last = haystack.length - length;
  const starts = new Set(
    [start, end - length, Math.round((start + end - length) / 2)].map((at) => Math.min(Math.max(at, 0), last)),
  );
  let best = 0;
  for (const at of starts) best = Math.max(best, (100 * lcsLength(needle, haystack.slice(at, at + length))) / length);
  return best;
}

/** The segment widened so that it never cuts a number in half. */
function widenToNumbers(text: string, start: number, end: number): string {
  const isDigit = (index: number) => /\d/u.test(text[index] ?? "");
  while (start > 0 && start < text.length && isDigit(start - 1) && isDigit(start)) start -= 1;
  while (end > 0 && end < text.length && isDigit(end - 1) && isDigit(end)) end += 1;
  return text.slice(start, end);
}

function sameNumbers(part: string, segment: string): boolean {
  const available = new Map<string, number>();
  for (const [number] of segment.matchAll(NUMBER)) available.set(number, (available.get(number) ?? 0) + 1);
  for (const [number] of part.matchAll(NUMBER)) {
    const left = available.get(number) ?? 0;
    if (left === 0) return false;
    available.set(number, left - 1);
  }
  return true;
}

function fuzzyPart(text: string, part: string, offset: number, limit: number): Hit | null {
  const exact = text.indexOf(part, offset);
  if (exact >= 0 && exact + part.length <= limit) return { start: exact, end: exact + part.length };
  const window = text.slice(offset, limit);
  if (part.length < FUZZY_MIN_CHARS || part.length > window.length) return null;
  const alignment = bestAlignment(part, window);
  if (!alignment || windowRatio(part, window, alignment.start, alignment.end) < FUZZY_THRESHOLD) return null;
  const start = offset + alignment.start;
  const end = offset + alignment.end;
  return sameNumbers(part, widenToNumbers(text, start, end)) ? { start, end } : null;
}

/** Each part approximately, in order; a later part must follow within `ELLIPSIS_MAX_GAP`. */
function fuzzyHit(text: string, parts: string[]): Hit | null {
  let start: number | null = null;
  let offset = 0;
  for (const part of parts) {
    const limit = start === null ? text.length : Math.min(text.length, offset + ELLIPSIS_MAX_GAP + part.length);
    const found = fuzzyPart(text, part, offset, limit);
    if (!found) return null;
    start ??= found.start;
    offset = found.end;
  }
  return start === null ? null : { start, end: offset };
}

/** The range in the original text, widened over a split character and the quotation marks the quote has. */
function toRange(text: string, quote: string, page: Folded, hit: Hit): TextRange {
  let start = page.origin[hit.start]!;
  const last = page.origin[hit.end - 1]!;
  let end = last + ((text.codePointAt(last) ?? 0) > 0xffff ? 2 : 1);
  while (end < text.length && COMBINING.test(text[end]!)) end += 1;
  const trimmed = quote.trim();
  if (QUOTE_CHARS.has(trimmed.at(0) ?? "") && QUOTE_CHARS.has(text[start - 1] ?? "")) start -= 1;
  if (QUOTE_CHARS.has(trimmed.at(-1) ?? "") && QUOTE_CHARS.has(text[end] ?? "")) end += 1;
  return { start, end };
}

/** Where `quote` is in `text`, or null. Quotes shorter than three characters never match. */
export function findQuote(text: string, quote: string): TextRange | null {
  const parts = quote
    .split(ELLIPSIS)
    .map((part) => compact(part).text)
    .filter(Boolean);
  if (parts.join("").length < MIN_QUOTE_CHARS) return null;
  const page = compact(text);
  if (!page.text) return null;
  const hit = exactHit(page.text, parts) ?? fuzzyHit(page.text, parts);
  return hit ? toRange(text, quote, page, hit) : null;
}

/** `text` split around `range`, for rendering the matched part in a <mark>. */
export function splitAtRange(text: string, range: TextRange | null): TextSegment[] {
  if (!range) return [{ text, isMatch: false }];
  return [
    { text: text.slice(0, range.start), isMatch: false },
    { text: text.slice(range.start, range.end), isMatch: true },
    { text: text.slice(range.end), isMatch: false },
  ].filter((segment) => segment.text.length > 0);
}
