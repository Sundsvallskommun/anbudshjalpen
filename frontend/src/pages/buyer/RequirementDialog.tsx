import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState, type FormEvent } from "react";
import type { Requirement, RequirementKind } from "../../api/types";
import { REQUIREMENT_KINDS } from "../../lib/labels";

const KIND_OPTIONS = REQUIREMENT_KINDS.map(({ kind, label }) => ({ value: kind, label }));

/** Field limits from the contract (contracts/tasks.py and contracts/common.py). */
const TITLE_MAX = 160;
const QUOTE_MIN = 3;
const QUOTE_MAX = 400;

type Field = "title" | "plain_language" | "page" | "quote";

/** What is wrong with an edited requirement, per field; empty when it can be saved. */
export function requirementErrors(requirement: Requirement): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const title = requirement.title.trim();
  if (!title) errors.title = "Ange en rubrik.";
  else if (title.length > TITLE_MAX) errors.title = `Rubriken får vara högst ${TITLE_MAX} tecken.`;
  if (!requirement.plain_language.trim()) errors.plain_language = "Förklara kravet med enkla ord.";
  if (!Number.isInteger(requirement.citation.page) || requirement.citation.page < 1) errors.page = "Ange sidnumret.";
  const quote = requirement.citation.quote.trim();
  if (quote.length < QUOTE_MIN || quote.length > QUOTE_MAX) {
    errors.quote = `Citatet ska vara ${QUOTE_MIN}–${QUOTE_MAX} tecken, ordagrant från sidan.`;
  }
  return errors;
}

/**
 * Edits one requirement. A changed citation loses its verification marks; the backend verifies it
 * again when the checklist is saved.
 */
function RequirementForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Requirement;
  onSave: (requirement: Requirement) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const errors = requirementErrors(draft);
  const set = (changes: Partial<Requirement>) => setDraft((previous) => ({ ...previous, ...changes }));
  const setCitation = (changes: Partial<Requirement["citation"]>) =>
    setDraft((previous) => ({
      ...previous,
      citation: { ...previous.citation, ...changes, check: null, found_page: null },
    }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length === 0) {
      onSave({
        ...draft,
        title: draft.title.trim(),
        plain_language: draft.plain_language.trim(),
        evidence: draft.evidence?.trim() || null,
        citation: { ...draft.citation, quote: draft.citation.quote.trim() },
      });
    }
  };

  const error = (message: string | undefined) => (submitted && message ? { type: "error" as const, message } : undefined);
  return (
    <form onSubmit={onSubmit} aria-label="Krav">
      <Layout
        content={
          <LayoutContent>
            <FormLayout defaultOptionality="required">
              <Selector
                label="Typ av krav"
                options={KIND_OPTIONS}
                value={draft.kind}
                onChange={(value) => set({ kind: value as RequirementKind })}
              />
              <TextInput
                label="Rubrik"
                value={draft.title}
                onChange={(title) => set({ title })}
                status={error(errors.title)}
              />
              <TextArea
                label="Vad kravet betyder, med enkla ord"
                value={draft.plain_language}
                onChange={(plain_language) => set({ plain_language })}
                rows={3}
                status={error(errors.plain_language)}
              />
              <TextInput
                label="Så visar leverantören det"
                value={draft.evidence ?? ""}
                onChange={(evidence) => set({ evidence })}
                isOptional
              />
              <NumberInput
                label="Sida i underlaget"
                value={draft.citation.page}
                onChange={(page) => setCitation({ page })}
                min={1}
                status={error(errors.page)}
              />
              <TextArea
                label="Citat från sidan"
                description="Kopiera texten ordagrant, så kan den kontrolleras mot underlaget."
                value={draft.citation.quote}
                onChange={(quote) => setCitation({ quote })}
                rows={3}
                maxLength={QUOTE_MAX}
                status={error(errors.quote)}
              />
            </FormLayout>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end" wrap="wrap">
              <Button label="Avbryt" variant="ghost" onClick={onCancel} />
              <Button type="submit" label="Spara kravet" variant="primary" />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  );
}

export function RequirementDialog({
  requirement,
  isNew,
  onSave,
  onClose,
}: {
  requirement: Requirement | null;
  isNew: boolean;
  onSave: (requirement: Requirement) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={requirement !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      width={640}
      purpose="form"
    >
      {/* The header is always mounted: the dialog takes its accessible name from the title. */}
      <Layout
        header={
          <DialogHeader
            title={isNew ? "Nytt krav" : "Ändra krav"}
            subtitle="Ändringen gäller först när du sparar checklistan."
            onOpenChange={(isOpen) => {
              if (!isOpen) onClose();
            }}
          />
        }
        content={
          requirement && (
            <RequirementForm key={requirement.id} initial={requirement} onSave={onSave} onCancel={onClose} />
          )
        }
      />
    </Dialog>
  );
}
