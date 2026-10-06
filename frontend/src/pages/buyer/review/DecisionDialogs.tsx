import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Checklist } from "../../../api/types";
import { ErrorNotice } from "../../../components/states";
import { formatLongDate } from "../../../lib/format";
import { keyDateIndex } from "../../../lib/keyDates";
import { NOTE_MAX } from "./forms/validation";

const NOTE_MIN = 3;

/** What publishing means for the companies' reminders (services/reminders.py follows the published dates). */
export function reminderSentence(checklist: Checklist): string {
  const date = (kind: "fragestopp" | "sista_anbudsdag") => checklist.dates[keyDateIndex(checklist, kind)]?.date ?? null;
  const question = date("fragestopp");
  const deadline = date("sista_anbudsdag");
  const known = [
    question ? `sista dag för frågor ${formatLongDate(question)}` : null,
    deadline ? `sista anbudsdag ${formatLongDate(deadline)}` : null,
  ].filter((part): part is string => part !== null);
  if (known.length === 0) {
    return "Checklistan har varken sista dag för frågor eller sista anbudsdag, så påminnelserna följer annonsens datum.";
  }
  return `Företagens påminnelser följer datumen i checklistan: ${known.join(" och ")}. De mejlas två dagar före, kl. 08:00.`;
}

/** A dialog whose content is a form: the header stays mounted (it names the dialog), the form shows while open. */
function FormDialog({
  isOpen,
  title,
  onClose,
  onSubmit,
  content,
  footer,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  content: ReactNode;
  footer: ReactNode;
}) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={560} purpose="form">
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          isOpen ? (
            <form onSubmit={onSubmit} aria-label={title} noValidate>
              <Layout
                content={<LayoutContent>{content}</LayoutContent>}
                footer={
                  <LayoutFooter hasDivider>
                    <HStack gap={2} hAlign="end" wrap="wrap">
                      <Button label="Avbryt" variant="ghost" onClick={onClose} />
                      {footer}
                    </HStack>
                  </LayoutFooter>
                }
              />
            </form>
          ) : undefined
        }
      />
    </Dialog>
  );
}

export interface PublishDialogProps {
  isOpen: boolean;
  /** A draft is approved and published in one go; an approved checklist is only published. */
  needsApproval: boolean;
  checklist: Checklist;
  /** The reviewer's note so far, which the dialog lets the buyer change. */
  note: string | null;
  /** Rows not yet marked "Kontrollerad", as a reminder before publishing. */
  uncheckedCount: number;
  hasEarlierPublished: boolean;
  isPending: boolean;
  error: unknown;
  onConfirm: (note: string | null) => void;
  onClose: () => void;
}

/**
 * The confirmation before companies see the checklist (direction.md, section 4): what happens, the reminders that
 * follow its dates, and the reviewer's note. What the buyer writes is kept here while the dialog is closed.
 */
export function PublishDialog({
  isOpen,
  needsApproval,
  checklist,
  note: savedNote,
  uncheckedCount,
  hasEarlierPublished,
  isPending,
  error,
  onConfirm,
  onClose,
}: PublishDialogProps) {
  const [edited, setEdited] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const note = edited ?? savedNote ?? "";
  const isTooLong = note.trim().length > NOTE_MAX;
  const title = needsApproval ? "Godkänn och publicera checklistan" : "Publicera checklistan";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitted(true);
    if (!isTooLong) onConfirm(note.trim() || null);
  };
  return (
    <FormDialog
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      onSubmit={submit}
      content={
        <VStack gap={4}>
          <Text as="p">
            {`Företagen ser checklistan direkt på upphandlingens sida, och Eneos assistenter kan läsa den.${
              hasEarlierPublished ? " Den ersätter den version som är publicerad i dag." : ""
            }`}
          </Text>
          <Text as="p">{reminderSentence(checklist)}</Text>
          {uncheckedCount > 0 && (
            <HStack gap={2} vAlign="start">
              <Icon icon="info" color="accent" size="sm" />
              <Text>{`${uncheckedCount} ${uncheckedCount === 1 ? "rad är" : "rader är"} inte markerade som kontrollerade.`}</Text>
            </HStack>
          )}
          <TextArea
            label="Anteckning från granskningen"
            description="Syns för inköp, inte för företagen."
            value={note}
            onChange={setEdited}
            rows={3}
            maxLength={NOTE_MAX}
            isOptional
            status={
              isSubmitted && isTooLong
                ? { type: "error", message: `Anteckningen får vara högst ${NOTE_MAX} tecken.` }
                : undefined
            }
          />
          {error !== null && <ErrorNotice title="Checklistan kunde inte publiceras" error={error} />}
        </VStack>
      }
      footer={
        <Button
          type="submit"
          label={needsApproval ? "Godkänn och publicera" : "Publicera"}
          variant="primary"
          isLoading={isPending}
        />
      }
    />
  );
}

export interface ReasonDialogProps {
  isOpen: boolean;
  title: string;
  intro: string;
  submitLabel: string;
  errorTitle: string;
  isPending: boolean;
  error: unknown;
  onSubmit: (note: string) => void;
  onClose: () => void;
}

/**
 * A step that needs the buyer's reason: rejecting a draft, or withdrawing a published checklist. The reason is kept
 * while the dialog is closed; give the dialog a new key once the step is done to start empty.
 */
export function ReasonDialog({ isOpen, title, intro, submitLabel, errorTitle, isPending, error, onSubmit, onClose }: ReasonDialogProps) {
  const [note, setNote] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const trimmed = note.trim();
  const problem =
    trimmed.length < NOTE_MIN
      ? "Skriv en motivering på minst tre tecken, så att den som rättar vet vad som är fel."
      : trimmed.length > NOTE_MAX
        ? `Motiveringen får vara högst ${NOTE_MAX} tecken.`
        : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitted(true);
    if (!problem) onSubmit(trimmed);
  };
  return (
    <FormDialog
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      onSubmit={submit}
      content={
        <VStack gap={3}>
          <Text as="p">{intro}</Text>
          <TextArea
            label="Motivering"
            value={note}
            onChange={setNote}
            rows={4}
            maxLength={NOTE_MAX}
            status={isSubmitted && problem ? { type: "error", message: problem } : undefined}
          />
          {error !== null && <ErrorNotice title={errorTitle} error={error} />}
        </VStack>
      }
      footer={<Button type="submit" label={submitLabel} variant="destructive" isLoading={isPending} />}
    />
  );
}
