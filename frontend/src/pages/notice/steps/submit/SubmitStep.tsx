import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import { useConfig } from "../../../../api/queries";
import type { ChecklistView, NoticeDetail, ReviewView } from "../../../../api/types";
import { wrapping } from "../../../../components/checklist/SectionRow";
import { StatusToken } from "../../../../components/tokens";
import { NextStepCard } from "../../../../components/ui/NextStepCard";
import { formatClock, formatLongDate } from "../../../../lib/format";
import { CHECK_STATUS } from "../../../../lib/labels";
import { externalLink, procurementLink, submissionLink } from "../../../../lib/links";
import { useIsPhone } from "../../../../lib/usePhone";
import { tenderDeadlineDate } from "../../noticeData";
import { StepLayout } from "../StepLayout";
import { knownValues, reviewedValues, submitGroups, type SubmitItem } from "./submitModel";
import { useStoredChecks } from "./useStoredChecks";

const REVIEWED = "Granskat";

function ReviewMark({ item }: { item: SubmitItem }) {
  if (item.review === "uppfyllt") return <Token label={REVIEWED} color="green" size="sm" icon={<Icon icon="success" size="sm" />} />;
  if (item.review) return <StatusToken status={item.review} size="sm" />;
  return null;
}

/**
 * The checkbox's description: the evidence line, and what the review found. Beside the text on wide screens the mark
 * is outside the description, so a screen reader hears it there in words. On a phone the mark itself goes under the
 * text, where a mark beside it would squeeze a requirement into a narrow column.
 */
function itemDescription(item: SubmitItem, isPhone: boolean): ReactNode {
  if (!item.review) return wrapping(item.description);
  if (isPhone) {
    // The design system puts the description in a span, so the stack is one too.
    return (
      <VStack as="span" gap={1} hAlign="start">
        {item.description}
        <ReviewMark item={item} />
      </VStack>
    );
  }
  const words = item.review === "uppfyllt" ? REVIEWED : CHECK_STATUS[item.review];
  return (
    <>
      {item.description && `${item.description} `}
      <VisuallyHidden>{`Granskningen: ${words}.`}</VisuallyHidden>
    </>
  );
}

/**
 * One list to tick off, on a card under its heading. The heading names the group for screen readers too, so the
 * group's own label is hidden.
 */
function Checklist({
  title,
  items,
  checked,
  onChange,
}: {
  title: string;
  items: readonly SubmitItem[];
  checked: readonly string[];
  onChange: (values: string[]) => void;
}) {
  const isPhone = useIsPhone();
  if (items.length === 0) return null;
  const own = new Set(items.map((item) => item.value));
  return (
    <Card>
      <VStack gap={2}>
        <Heading level={3}>{title}</Heading>
        <CheckboxList
          label={title}
          isLabelHidden
          value={checked.filter((value) => own.has(value))}
          onChange={(values) => onChange([...checked.filter((value) => !own.has(value)), ...values])}
          hasDividers
        >
          {items.map((item) => (
            <CheckboxListItem
              key={item.value}
              value={item.value}
              // A node, not a string: the design system cuts a string label off at one line; a requirement must be
              // read in full (WCAG 1.4.10). The checkbox is named from this visible text.
              label={<Text>{item.label}</Text>}
              description={itemDescription(item, isPhone)}
              endContent={isPhone ? undefined : <ReviewMark item={item} />}
            />
          ))}
        </CheckboxList>
      </VStack>
    </Card>
  );
}

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
 * The end of the journey: where the tender is handed in and by when. The procurement in e-Avrop when the notice links
 * there, else e-Avrop itself or the notice's own page (lib/links submissionLink). A made-up notice says why it is not
 * in e-Avrop.
 */
function HandIn({ notice }: { notice: NoticeDetail }) {
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
            variant={isMadeUp ? "secondary" : "primary"}
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

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={3} accessibilityLevel={2}>
          Ditt framsteg
        </Heading>
        <ProgressBar label={`${done} av ${total} klara`} value={done} max={Math.max(total, 1)} variant={done === total ? "success" : "accent"} />
        <Text type="supporting">Bockarna sparas bara i den här webbläsaren.</Text>
      </VStack>
    </Card>
  );
}

/**
 * Step 4 Lämna in (direction.md, section 4): every skall- and kvalificeringskrav and every attachment to tick off,
 * with what the draft review found already ticked and marked "Granskat", and what it did not find flagged. Ends with
 * the way to e-Avrop, where the tender is handed in. The ticks stay in this browser.
 */
export function SubmitStep({ notice, view, review }: { notice: NoticeDetail; view: ChecklistView; review: ReviewView | null }) {
  const [stored, setStored] = useStoredChecks(notice.id);
  if (view.status !== "published") {
    return (
      <Card>
        <EmptyState
          headingLevel={2}
          title="Sista kontrollen kommer med checklistan"
          description="När inköp har publicerat checklistan visas en lista att gå igenom innan du lämnar anbudet."
        />
      </Card>
    );
  }
  const groups = submitGroups(view.checklist, review);
  const checked = knownValues(groups, stored ?? reviewedValues(groups));
  const total = groups.requirements.length + groups.attachments.length;
  return (
    <StepLayout rail={<Progress done={checked.length} total={total} />} railLabel="Ditt framsteg" isRailSticky narrowRail="before">
      <VStack gap={2}>
        <Heading level={2}>Lämna in</Heading>
        <Text color="secondary">
          {review
            ? "Gå igenom listan innan du lämnar anbudet. Det som granskningen hittade i ditt utkast är redan förbockat."
            : "Gå igenom listan innan du lämnar anbudet. Granska ditt utkast i steg 3, så bockas det som redan finns med av."}
        </Text>
      </VStack>
      <Checklist title="Skall- och kvalificeringskrav" items={groups.requirements} checked={checked} onChange={setStored} />
      <Checklist title="Bilagor att lämna med" items={groups.attachments} checked={checked} onChange={setStored} />
      <HandIn notice={notice} />
    </StepLayout>
  );
}
