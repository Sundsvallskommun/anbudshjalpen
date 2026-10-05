import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Token } from "@astryxdesign/core/Token";
import type { Citation, CitationCheck } from "../../api/types";
import { citationStatus } from "../../lib/labels";
import { citationPage } from "./citation";
import { useOpenCitation } from "./CitationViewer";

const MARKS: Record<CitationCheck, { icon: "success" | "info" | "warning"; color: "success" | "accent" | "warning" }> = {
  verified: { icon: "success", color: "success" },
  moved: { icon: "info", color: "accent" },
  unverified: { icon: "warning", color: "warning" },
};

/**
 * A claim's source: the page and how verification went, in words and with a distinct icon per status.
 * Pressing it opens the page with the quote marked (in the notice's page viewer, or via `href` on the
 * notice page when shown elsewhere).
 */
export function CitationChip({
  citation,
  documentId,
  href,
}: {
  citation: Citation;
  documentId?: string;
  href?: string;
}) {
  const open = useOpenCitation();
  const page = citationPage(citation);
  const status = citationStatus(citation.check);
  const mark = MARKS[citation.check ?? "unverified"];
  const icon = <Icon icon={mark.icon} color={mark.color} size="sm" />;
  const visible = `Sida ${page} · ${status}`;
  const label = `Sida ${page}, ${status.toLocaleLowerCase("sv")}. Visa källan`;
  const tooltip = citation.check === "moved" ? `AI:n angav sida ${citation.page}` : undefined;

  if (href) {
    return <Button size="sm" label={label} icon={icon} href={href} tooltip={tooltip}>{visible}</Button>;
  }
  if (open && documentId) {
    return (
      <Button size="sm" label={label} icon={icon} tooltip={tooltip} onClick={() => open({ documentId, citation })}>
        {visible}
      </Button>
    );
  }
  return <Token size="sm" label={visible} icon={icon} />;
}

/** Link to a notice's document tab, opened on a citation's page with its quote marked. */
export function citationHref(noticeId: string, citation: Citation): string {
  const params = new URLSearchParams({ flik: "underlag", sida: String(citationPage(citation)), citat: citation.quote });
  return `/upphandlingar/${noticeId}?${params.toString()}`;
}
