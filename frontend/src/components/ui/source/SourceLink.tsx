import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Token } from "@astryxdesign/core/Token";
import type { MouseEvent } from "react";
import type { Citation } from "../../../api/types";
import { citationPage } from "../../../lib/labels";
import { useOptionalSourceDialog } from "./SourceDialogProvider";
import styles from "./SourceLink.module.css";
import { sourceHref } from "./sourceTarget";

export interface SourceLinkProps {
  noticeId: string;
  citation: Citation;
  /** The statement the source backs, as the reader sees it; part of the link's name, so every link's name is unique. */
  claim: string;
  /** Where the claim is shown ("Skallkrav", "Därför verkar den passa"); "Från: …" in the dialog. */
  origin?: string;
  /** The document the page belongs to; the notice's primary document when left out (answers pass their own). */
  documentId?: string;
  /** In running text the link needs no enlarged hit area (WCAG 2.5.8 exempts inline targets). */
  isInline?: boolean;
}

/** A plain click opens the dialog in place; a click that asks for a new tab or window keeps the address. */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * A claim's source: "s. 5" as a quiet link (13 px accent, no icon). Only deviations get a token and words: a quote
 * found on another page reads "s. 9 (AI angav 7)" on blue, one that was not found "Hittades inte i underlaget" on
 * yellow. It always opens the source dialog; its address (`?citat=…`) opens the same dialog on the notice page from
 * anywhere else. The name says what the source backs: "Visa källan för ”Anbudet är skrivet på svenska”, s. 5".
 */
export function SourceLink({ noticeId, citation, claim, origin, documentId, isInline = false }: SourceLinkProps) {
  const dialog = useOptionalSourceDialog();
  const page = citationPage(citation);

  const onClick = (event: MouseEvent) => {
    if (!dialog || !isPlainClick(event)) return;
    event.preventDefault();
    dialog.openSource({ noticeId, citation, claim, origin, documentId });
  };

  const visibleWords =
    citation.check === "moved"
      ? `s. ${page} (AI angav ${citation.page})`
      : citation.check === "unverified"
        ? "Hittades inte i underlaget"
        : `s. ${page}`;
  // The name starts with what the source backs and ends with the visible words (WCAG 2.4.4 and 2.5.3).
  const name = claim ? `Visa källan för ”${claim}”, ${visibleWords}` : `Visa källan, ${visibleWords}`;
  const visible =
    citation.check === "moved" ? (
      <Token label={visibleWords} color="blue" size="sm" />
    ) : citation.check === "unverified" ? (
      <Token label={visibleWords} color="yellow" size="sm" icon={<Icon icon="warning" size="sm" />} />
    ) : (
      visibleWords
    );

  return (
    <Link
      href={sourceHref(noticeId, citation, claim)}
      label={name}
      onClick={onClick}
      size="sm"
      hasUnderline
      aria-haspopup="dialog"
      className={isInline ? undefined : styles.target}
    >
      {visible}
    </Link>
  );
}
