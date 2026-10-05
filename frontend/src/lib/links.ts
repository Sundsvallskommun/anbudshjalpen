/**
 * Links out of the app to where a procurement lives. A notice's links may point to e-Avrop, to TED or (for
 * a notice a buyer added by hand) anywhere, so a link's words follow its address: only an e-Avrop address
 * is called e-Avrop.
 */
import type { NoticeDetail } from "../api/types";

export type LinkSite = "eavrop" | "ted" | "other";

export interface ExternalLink {
  href: string;
  site: LinkSite;
}

function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** The link with the site it goes to, or null for anything but an absolute http(s) address. */
export function externalLink(href: string | null | undefined): ExternalLink | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const site: LinkSite = isHost(host, "e-avrop.com") ? "eavrop" : isHost(host, "ted.europa.eu") ? "ted" : "other";
  return { href: url.href, site };
}

/**
 * Where a supplier asks formal questions and submits the tender: the procurement in e-Avrop when either of
 * the notice's links goes there, else the notice's own link (the documents link first).
 */
export function procurementLink(notice: Pick<NoticeDetail, "documents_url" | "url">): ExternalLink | null {
  const links = [notice.documents_url, notice.url]
    .map(externalLink)
    .filter((link): link is ExternalLink => link !== null);
  return links.find((link) => link.site === "eavrop") ?? links[0] ?? null;
}

/** Words for a link to the notice itself. */
export function noticeLinkText(site: LinkSite): string {
  if (site === "eavrop") return "Öppna upphandlingen i e-Avrop";
  if (site === "ted") return "Öppna annonsen i TED";
  return "Öppna annonsen";
}

export interface LabelledLink {
  href: string;
  text: string;
}

/**
 * Where to ask a formal question. The procurement in e-Avrop when the notice links there. Else the page the
 * backend names (`formal_question_url`): when the notice has no page with a question function (no link, or
 * only TED's) that is e-Avrop itself, so it is not called the procurement. Else the notice's own link.
 */
export function formalQuestionLink(
  notice: Pick<NoticeDetail, "documents_url" | "url">,
  formalQuestionUrl: string | null | undefined,
): LabelledLink | null {
  const own = procurementLink(notice);
  if (own?.site === "eavrop") return { href: own.href, text: noticeLinkText(own.site) };
  const formal = externalLink(formalQuestionUrl);
  const ownHrefs = [notice.documents_url, notice.url].map((href) => externalLink(href)?.href);
  if (formal && !ownHrefs.includes(formal.href)) {
    return { href: formal.href, text: formal.site === "eavrop" ? "Gå till e-Avrop" : "Öppna sidan där frågor ställs" };
  }
  return own ? { href: own.href, text: noticeLinkText(own.site) } : null;
}

/**
 * Where a supplier submits the tender. The procurement in e-Avrop when the notice links there, else a page of the
 * notice's own that is not TED's. TED has no submission (nor question) function, so a notice with no page of its
 * own, or only TED's, gets the municipality's page in e-Avrop (`AppConfig.eavrop_url`): the same rule as the
 * backend's `formal_question_url`.
 */
export function submissionLink(
  notice: Pick<NoticeDetail, "documents_url" | "url">,
  eavropUrl: string | null | undefined,
): LabelledLink | null {
  const own = procurementLink(notice);
  if (own?.site === "eavrop") return { href: own.href, text: "Lämna anbudet i e-Avrop" };
  if (own?.site === "other") return { href: own.href, text: noticeLinkText(own.site) };
  const eavrop = externalLink(eavropUrl);
  if (eavrop) return { href: eavrop.href, text: "Gå till e-Avrop" };
  return own ? { href: own.href, text: noticeLinkText(own.site) } : null;
}
