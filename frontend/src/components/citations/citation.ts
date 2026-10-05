import type { Citation } from "../../api/types";

/** The page a citation should open on: where verification found the quote, else the page the AI gave. */
export function citationPage(citation: Citation): number {
  return citation.check === "moved" && citation.found_page ? citation.found_page : citation.page;
}
