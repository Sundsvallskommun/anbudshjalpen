/**
 * What the buyer must fill in before an edited item can be saved: the contract's own limits
 * (backend/src/anbudsklar/contracts/tasks.py and common.py), with messages that say how to fix the field. The forms
 * validate when they are sent, so the button is always active (direction.md, section 10).
 */
import type {
  Citation,
  EvaluationCriterion,
  KeyDate,
  RequiredAttachment,
  Requirement,
  TermExplanation,
} from "../../../../api/types";

export const TITLE_MAX = 160;
export const QUOTE_MIN = 3;
export const QUOTE_MAX = 400;
export const NOTE_MAX = 2000;

export type Errors<Field extends string> = Partial<Record<Field, string>>;

export type CitationField = "page" | "quote";

/** A citation's page and quote: a page of the document, and a quote of 3–400 characters copied from it. */
export function citationErrors(citation: Pick<Citation, "page" | "quote">, pageCount?: number): Errors<CitationField> {
  const errors: Errors<CitationField> = {};
  if (!Number.isInteger(citation.page) || citation.page < 1) errors.page = "Ange sidan där citatet står.";
  else if (pageCount !== undefined && pageCount > 0 && citation.page > pageCount) {
    errors.page = `Underlaget har ${pageCount} sidor. Ange en sida mellan 1 och ${pageCount}.`;
  }
  const quote = citation.quote.trim();
  if (quote.length < QUOTE_MIN || quote.length > QUOTE_MAX) {
    errors.quote = `Citatet ska vara ${QUOTE_MIN}–${QUOTE_MAX} tecken, ordagrant från sidan.`;
  }
  return errors;
}

export function requirementErrors(
  requirement: Requirement,
  pageCount?: number,
): Errors<"title" | "plain_language" | CitationField> {
  const errors: Errors<"title" | "plain_language" | CitationField> = citationErrors(requirement.citation, pageCount);
  const title = requirement.title.trim();
  if (!title) errors.title = "Skriv kravet.";
  else if (title.length > TITLE_MAX) errors.title = `Kravet får vara högst ${TITLE_MAX} tecken. Förklara resten nedan.`;
  if (!requirement.plain_language.trim()) errors.plain_language = "Förklara kravet med enkla ord.";
  return errors;
}

export function dateErrors(date: KeyDate, pageCount?: number): Errors<"description" | CitationField> {
  const errors: Errors<"description" | CitationField> = citationErrors(date.citation, pageCount);
  if (!date.description.trim()) errors.description = "Beskriv vad som ska ske den dagen.";
  return errors;
}

export function attachmentErrors(attachment: RequiredAttachment, pageCount?: number): Errors<"name" | CitationField> {
  const errors: Errors<"name" | CitationField> = citationErrors(attachment.citation, pageCount);
  if (!attachment.name.trim()) errors.name = "Ange bilagans namn.";
  return errors;
}

export function evaluationErrors(
  criterion: EvaluationCriterion,
  pageCount?: number,
): Errors<"name" | "weight_percent" | "how_assessed" | CitationField> {
  const errors: Errors<"name" | "weight_percent" | "how_assessed" | CitationField> = citationErrors(
    criterion.citation,
    pageCount,
  );
  if (!criterion.name.trim()) errors.name = "Ange vad som utvärderas, till exempel Pris.";
  const weight = criterion.weight_percent;
  if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 100)) {
    errors.weight_percent = "Vikten är en procentsats mellan 0 och 100. Lämna fältet tomt om underlaget inte anger den.";
  }
  if (!criterion.how_assessed.trim()) errors.how_assessed = "Förklara hur kriteriet bedöms.";
  return errors;
}

/** A term's source is optional, but a page or a quote alone is half a source. */
export function termErrors(term: TermExplanation, pageCount?: number): Errors<"term" | "explanation" | CitationField> {
  const errors: Errors<"term" | "explanation" | CitationField> = term.citation
    ? citationErrors(term.citation, pageCount)
    : {};
  if (!term.term.trim()) errors.term = "Ange ordet eller begreppet.";
  if (!term.explanation.trim()) errors.explanation = "Förklara vad det betyder i den här upphandlingen.";
  return errors;
}

export function questionErrors(question: string): Errors<"question"> {
  return question.trim() ? {} : { question: "Skriv vad underlaget inte gör tydligt." };
}

export function summaryErrors(summary: string): Errors<"summary"> {
  return summary.trim() ? {} : { summary: "Skriv 2–4 meningar för företagen om vad upphandlingen gäller." };
}

/** A field's status for a form control once the form has been sent: the message, as an error. */
export function fieldStatus(
  isSubmitted: boolean,
  message: string | undefined,
): { type: "error"; message: string } | undefined {
  return isSubmitted && message ? { type: "error", message } : undefined;
}

export function hasErrors(errors: Errors<string>): boolean {
  return Object.values(errors).some(Boolean);
}
