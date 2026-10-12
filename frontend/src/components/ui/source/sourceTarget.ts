/**
 * What the source dialog shows, and the address that opens it. Every "s. N" in the app opens the same dialog
 * (direction.md, section 4 "Källan"): the claim, the status in words, the cited quote and the page with the quote
 * marked. A link to `/upphandlingar/:id?citat=…&sida=…&pastaende=…` opens it on the notice page, so a source can be
 * linked to from a mail, another page or a new tab.
 */
import type { Citation, NoticeDetail } from "../../../api/types";

/** A claim and the citation that backs it. */
export interface SourceTarget {
  noticeId: string;
  citation: Citation;
  /** The statement the source backs, as the reader saw it ("Anbudet är skrivet på svenska"). */
  claim: string;
  /** Where the claim was shown ("Skallkrav", "Därför verkar den passa"); "Från: …" in the dialog. */
  origin?: string;
  /** The document the citation's page belongs to; the notice's primary document when left out. */
  documentId?: string;
}

/** A document to read from a page, without a claim ("Underlaget · 17 sidor"). */
export interface DocumentTarget {
  noticeId: string;
  documentId?: string;
  /** The page to open on; 1 when left out. */
  page?: number;
}

export type DialogTarget = ({ kind: "source" } & SourceTarget) | ({ kind: "document" } & DocumentTarget);

export const SOURCE_PARAMS = { quote: "citat", page: "sida", claim: "pastaende", document: "dokument", step: "flik" } as const;

/** The address that opens a claim's source on its notice page; `documentId` names the file when it is not the primary one. */
export function sourceHref(
  noticeId: string,
  citation: Pick<Citation, "page" | "quote" | "check" | "found_page">,
  claim?: string,
  documentId?: string,
): string {
  const page = citation.check === "moved" && citation.found_page ? citation.found_page : citation.page;
  const params = new URLSearchParams({ [SOURCE_PARAMS.quote]: citation.quote, [SOURCE_PARAMS.page]: String(page) });
  if (claim) params.set(SOURCE_PARAMS.claim, claim);
  if (documentId) params.set(SOURCE_PARAMS.document, documentId);
  return `/upphandlingar/${noticeId}?${params.toString()}`;
}

/**
 * The document a notice's checklist and fit citations cite: the checklist's own document, else the first one.
 * Answers name their document (`AnswerView.document_id`); pass it as `documentId` instead.
 */
export function primaryDocumentId(notice: Pick<NoticeDetail, "checklist" | "documents">): string | undefined {
  return notice.checklist?.document_id ?? notice.documents[0]?.id;
}

/** Every citation a notice shows, to give a quote from an address back its verification. */
function knownCitations(notice: NoticeDetail): Citation[] {
  const checklist = notice.checklist?.checklist;
  const fromChecklist = checklist
    ? [
        ...checklist.requirements.map((item) => item.citation),
        ...checklist.attachments.map((item) => item.citation),
        ...checklist.evaluation.map((item) => item.citation),
        ...checklist.dates.map((item) => item.citation),
        ...checklist.terms.flatMap((item) => (item.citation ? [item.citation] : [])),
      ]
    : [];
  const fromMatch = notice.match?.assessment.reasons.flatMap((reason) => (reason.citation ? [reason.citation] : [])) ?? [];
  return [...fromChecklist, ...fromMatch];
}

/**
 * The dialog target an address asks for on a notice page, or null: `?citat=` (with `sida` and `pastaende`) opens a
 * source, and `?flik=underlag` (the old document tab) opens the document on `sida` or page 1. A quote's verification
 * comes from the notice's own citations, never from the address; an unknown quote is shown as unchecked, and the
 * dialog marks it only if it is on the page.
 */
export function targetFromParams(params: URLSearchParams, notice: NoticeDetail): DialogTarget | null {
  const quote = params.get(SOURCE_PARAMS.quote)?.trim();
  const page = Math.max(1, Number.parseInt(params.get(SOURCE_PARAMS.page) ?? "1", 10) || 1);
  if (quote) {
    const known = knownCitations(notice).find(
      (citation) => citation.quote === quote && (citation.page === page || citation.found_page === page),
    );
    const citation: Citation = known ?? { page, quote, check: null, found_page: null, document: null, document_id: null };
    // Only a document of this notice: an address cannot make the dialog read some other notice's file.
    const named = params.get(SOURCE_PARAMS.document);
    const documentId = notice.documents.some((document) => document.id === named) ? (named ?? undefined) : undefined;
    return { kind: "source", noticeId: notice.id, citation, claim: params.get(SOURCE_PARAMS.claim) ?? "", documentId };
  }
  if (params.get(SOURCE_PARAMS.step) === "underlag") return { kind: "document", noticeId: notice.id, page };
  return null;
}
