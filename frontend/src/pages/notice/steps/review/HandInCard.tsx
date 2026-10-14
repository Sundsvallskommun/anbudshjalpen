import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { useConfig } from "../../../../api/queries";
import type { NoticeDetail } from "../../../../api/types";
import { NextStepCard } from "../../../../components/ui/NextStepCard";
import { formatClock, formatLongDate } from "../../../../lib/format";
import { externalLink, procurementLink, submissionLink } from "../../../../lib/links";
import { tenderDeadlineDate } from "../../noticeData";

/** "9 november 2026 kl. 23:59", or "9 november 2026" for a deadline that is a date. */
function longMoment(deadline: string): string {
  const clock = formatClock(deadline);
  return `${formatLongDate(deadline)}${clock ? ` ${clock}` : ""}`;
}

/** Sista anbudsdag: the notice's own deadline, or a restricted procedure's from the checklist (a date), if it has one. */
function tenderDeadline(notice: NoticeDetail): string | null {
  return notice.deadline_kind === "request" ? tenderDeadlineDate(notice) : notice.deadline_at;
}

/** "Lämna anbudet i e-Avrop senast 9 november 2026 kl. 23:59." */
function deadlineSentence(deadline: string | null, isEavrop: boolean): string {
  const where = isEavrop ? " i e-Avrop" : "";
  if (!deadline) return `Lämna anbudet${where} före sista anbudsdag.`;
  return `Lämna anbudet${where} senast ${longMoment(deadline)}.`;
}

/**
 * A restricted procedure starts with a request to participate: the notice's own deadline is the last day for it, and
 * only the suppliers the buyer then invites hand in tenders.
 */
function requestSentence(notice: NoticeDetail): string | null {
  if (notice.deadline_kind !== "request" || !notice.deadline_at) return null;
  return `Upphandlingen är ett selektivt förfarande: först lämnar du en anbudsansökan, senast ${longMoment(notice.deadline_at)}. Köparen bjuder sedan in de leverantörer som får lämna anbud.`;
}

/**
 * "Lämna anbudet", the end of the journey at the end of Granska (decision 0024): where the tender is handed in and by
 * when. The procurement in e-Avrop when the notice links there, else e-Avrop itself or the notice's own page
 * (lib/links submissionLink). A made-up notice says why it is not in e-Avrop. The button is the view's primary
 * action only when the step has no other (`variant`); a made-up notice never gets a primary one.
 */
export function HandInCard({ notice, variant }: { notice: NoticeDetail; variant: "primary" | "secondary" }) {
  const config = useConfig();
  const link = submissionLink(notice, config.data?.eavrop_url);
  const isMadeUp = notice.is_fictitious && !procurementLink(notice);
  const isEavrop = externalLink(link?.href)?.site === "eavrop";
  const words = procurementLink(notice)?.site === "eavrop" ? "Gå till e-Avrop och lämna anbudet" : (link?.text ?? "");
  const text = isMadeUp
    ? "Den här upphandlingen är påhittad och finns inte i e-Avrop. I en riktig upphandling lämnar du anbudet där."
    : [
        requestSentence(notice),
        deadlineSentence(tenderDeadline(notice), isEavrop),
        "Ett anbud som kommer in för sent prövas inte.",
        isEavrop ? "I e-Avrop kan du oftast ändra ditt anbud fram till sista anbudsdag." : null,
      ]
        .filter(Boolean)
        .join(" ");
  return (
    <NextStepCard
      title="Lämna anbudet"
      text={text}
      action={
        link ? (
          <Button
            label={`${words} (öppnas i en ny flik)`}
            variant={isMadeUp ? "secondary" : variant}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            endContent={<Icon icon="externalLink" />}
          >
            {words}
          </Button>
        ) : null
      }
    />
  );
}
