import { useMemo } from "react";
import { usePages } from "../../../api/queries";
import type { Requirement } from "../../../api/types";
import { citationPage } from "../../../lib/labels";
import { headingAbove } from "./sections";

const NO_PAGES: readonly number[] = [];

/** More pages than this are not read in full for the checks: a document that long is read page by page in the pane. */
export const WHOLE_DOCUMENT_MAX = 60;

/**
 * The text of the given pages of a document, by page number, as they arrive. One query per page through `usePages`,
 * which shares its cache with the page shown beside the list, so a page is fetched once. Nothing is fetched until the
 * document is known.
 */
export function usePageTexts(
  noticeId: string,
  documentId: string | undefined,
  pages: readonly number[],
): ReadonlyMap<number, string> {
  const wanted = documentId ? pages : NO_PAGES;
  const results = usePages(noticeId, documentId ?? "", wanted);
  // The results are a new array on every render; the texts only change when a page arrives.
  const arrived = results.map((result) => result.dataUpdatedAt).join(",");
  return useMemo(() => {
    const texts = new Map<number, string>();
    results.forEach((result, index) => {
      const page = wanted[index];
      if (page !== undefined && result.data) texts.set(page, result.data.text);
    });
    return texts;
    // `arrived` stands for `results`: it changes exactly when a page's text does.
  }, [wanted, arrived]);
}

/** The pages a requirement's quote can be found on: those the check found it on, or the AI gave when not checked yet. */
export function citedPages(requirements: readonly Requirement[], pageCount: number): number[] {
  const pages = requirements
    .filter((requirement) => requirement.citation.check !== "unverified")
    .map((requirement) => citationPage(requirement.citation))
    .filter((page) => page >= 1 && (pageCount <= 0 || page <= pageCount));
  return [...new Set(pages)].sort((a, b) => a - b);
}

/** Every page of a document, 1 to its page count, up to WHOLE_DOCUMENT_MAX. */
export function allPages(pageCount: number): number[] {
  return Array.from({ length: Math.min(Math.max(pageCount, 0), WHOLE_DOCUMENT_MAX) }, (_, index) => index + 1);
}

/** The section heading each requirement stands under, by requirement id, for the pages loaded so far. */
export function useRequirementHeadings(
  requirements: readonly Requirement[],
  texts: ReadonlyMap<number, string>,
): ReadonlyMap<string, string> {
  return useMemo(() => {
    const headings = new Map<string, string>();
    for (const requirement of requirements) {
      if (requirement.citation.check === "unverified") continue;
      const text = texts.get(citationPage(requirement.citation));
      const heading = text ? headingAbove(text, requirement.citation.quote) : null;
      if (heading) headings.set(requirement.id, heading);
    }
    return headings;
  }, [requirements, texts]);
}
