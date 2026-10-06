import type { ISODateString } from "@astryxdesign/core/Calendar";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type {
  DateKind,
  EvaluationCriterion,
  KeyDate,
  RequiredAttachment,
  Requirement,
  RequirementKind,
  TermExplanation,
} from "../../../../api/types";
import { DATE_KIND, REQUIREMENT_KINDS } from "../../../../lib/labels";
import { emptyCitation } from "../rows";
import { CitationFields, FormFrame, useItemForm } from "./FormParts";
import {
  attachmentErrors,
  dateErrors,
  evaluationErrors,
  questionErrors,
  requirementErrors,
  summaryErrors,
  termErrors,
  TITLE_MAX,
} from "./validation";

/** What every item form takes: the item to start from, where it is shown, and what saving and cancelling do. */
export interface ItemFormProps<T> {
  initial: T;
  /** A new item has nothing to compare with; an edited one says what a changed type was ("Var: Skallkrav"). */
  isNew?: boolean;
  /** The form's name for assistive technology, the same as its heading: "Ändra kravet", "Nytt datum". */
  label: string;
  isInPane: boolean;
  /** The document's page count, so a page past its end is caught before saving. */
  pageCount?: number;
  onSave: (value: T) => void;
  onCancel: () => void;
}

const KIND_OPTIONS = REQUIREMENT_KINDS.map(({ kind, label, description }) => ({ value: kind, label, description }));
const KIND_LABEL = Object.fromEntries(REQUIREMENT_KINDS.map(({ kind, label }) => [kind, label])) as Record<RequirementKind, string>;
const DATE_KIND_OPTIONS = (Object.keys(DATE_KIND) as DateKind[]).map((kind) => ({ value: kind, label: DATE_KIND[kind] }));

/** What an edited field said before the buyer changed it, as the helper under its label ("Var: Krav på uppdraget"). */
function wasText(isNew: boolean | undefined, before: string, now: string, label: string): string | undefined {
  return !isNew && before !== now ? `Var: ${label}` : undefined;
}

/** Trimmed text, or null when nothing is left. */
function optional(text: string | null): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function RequirementForm({ initial, isNew, label, isInPane, pageCount, onSave, onCancel }: ItemFormProps<Requirement>) {
  const form = useItemForm(initial, (value: Requirement) => requirementErrors(value, pageCount));
  const { draft, setDraft } = form;
  const set = (changes: Partial<Requirement>) => setDraft((previous) => ({ ...previous, ...changes }));
  return (
    <FormFrame
      label={label}
      submitLabel="Spara kravet"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) =>
        onSave({
          ...value,
          title: value.title.trim(),
          plain_language: value.plain_language.trim(),
          evidence: optional(value.evidence),
          citation: { ...value.citation, quote: value.citation.quote.trim() },
        }),
      )}
    >
      <Selector
        label="Typ av krav"
        description={wasText(isNew, initial.kind, draft.kind, KIND_LABEL[initial.kind])}
        options={KIND_OPTIONS}
        value={draft.kind}
        onChange={(kind) => set({ kind: kind as RequirementKind })}
      />
      <TextArea
        label="Kravet"
        description={`En mening, högst ${TITLE_MAX} tecken.`}
        value={draft.title}
        onChange={(title) => set({ title })}
        rows={2}
        maxLength={TITLE_MAX}
        status={form.status("title")}
      />
      <TextArea
        label="Vad kravet betyder, med enkla ord"
        value={draft.plain_language}
        onChange={(plain_language) => set({ plain_language })}
        rows={3}
        status={form.status("plain_language")}
      />
      <TextInput
        label="Så visar leverantören det"
        description="Till exempel ett försäkringsbevis eller en bilaga."
        value={draft.evidence ?? ""}
        onChange={(evidence) => set({ evidence })}
        isOptional
      />
      <CitationFields
        citation={draft.citation}
        onChange={(citation) => set({ citation })}
        errors={form.errors}
        isSubmitted={form.isSubmitted}
        pageCount={pageCount}
      />
    </FormFrame>
  );
}

export function DateForm({ initial, isNew, label, isInPane, pageCount, onSave, onCancel }: ItemFormProps<KeyDate>) {
  const form = useItemForm(initial, (value: KeyDate) => dateErrors(value, pageCount));
  const { draft, setDraft } = form;
  const set = (changes: Partial<KeyDate>) => setDraft((previous) => ({ ...previous, ...changes }));
  return (
    <FormFrame
      label={label}
      submitLabel="Spara datumet"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) =>
        onSave({
          ...value,
          description: value.description.trim(),
          citation: { ...value.citation, quote: value.citation.quote.trim() },
        }),
      )}
    >
      <Selector
        label="Vilket datum"
        description={wasText(isNew, initial.kind, draft.kind, DATE_KIND[initial.kind])}
        options={DATE_KIND_OPTIONS}
        value={draft.kind}
        onChange={(kind) => set({ kind: kind as DateKind })}
      />
      <DateInput
        label="Datum"
        description="Lämna tomt om underlaget inte anger en dag."
        value={(draft.date ?? undefined) as ISODateString | undefined}
        onChange={(date) => set({ date: date ?? null })}
        weekStartsOn="mon"
        hasClear
        isOptional
        // The native picker probes the engine with an injected <style>, which the strict CSP blocks.
        nativePicker="never"
      />
      <TextArea
        label="Vad som sker"
        value={draft.description}
        onChange={(description) => set({ description })}
        rows={2}
        status={form.status("description")}
      />
      <CitationFields
        citation={draft.citation}
        onChange={(citation) => set({ citation })}
        errors={form.errors}
        isSubmitted={form.isSubmitted}
        pageCount={pageCount}
      />
    </FormFrame>
  );
}

export function AttachmentForm({
  initial,
  label,
  isInPane,
  pageCount,
  onSave,
  onCancel,
}: ItemFormProps<RequiredAttachment>) {
  const form = useItemForm(initial, (value: RequiredAttachment) => attachmentErrors(value, pageCount));
  const { draft, setDraft } = form;
  const set = (changes: Partial<RequiredAttachment>) => setDraft((previous) => ({ ...previous, ...changes }));
  return (
    <FormFrame
      label={label}
      submitLabel="Spara bilagan"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) =>
        onSave({
          ...value,
          name: value.name.trim(),
          description: optional(value.description),
          citation: { ...value.citation, quote: value.citation.quote.trim() },
        }),
      )}
    >
      <TextInput label="Bilagans namn" value={draft.name} onChange={(name) => set({ name })} status={form.status("name")} />
      <TextArea
        label="Beskrivning"
        value={draft.description ?? ""}
        onChange={(description) => set({ description })}
        rows={2}
        isOptional
      />
      <CitationFields
        citation={draft.citation}
        onChange={(citation) => set({ citation })}
        errors={form.errors}
        isSubmitted={form.isSubmitted}
        pageCount={pageCount}
      />
    </FormFrame>
  );
}

export function EvaluationForm({
  initial,
  label,
  isInPane,
  pageCount,
  onSave,
  onCancel,
}: ItemFormProps<EvaluationCriterion>) {
  const form = useItemForm(initial, (value: EvaluationCriterion) => evaluationErrors(value, pageCount));
  const { draft, setDraft } = form;
  const set = (changes: Partial<EvaluationCriterion>) => setDraft((previous) => ({ ...previous, ...changes }));
  return (
    <FormFrame
      label={label}
      submitLabel="Spara kriteriet"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) =>
        onSave({
          ...value,
          name: value.name.trim(),
          how_assessed: value.how_assessed.trim(),
          citation: { ...value.citation, quote: value.citation.quote.trim() },
        }),
      )}
    >
      <TextInput label="Kriterium" value={draft.name} onChange={(name) => set({ name })} status={form.status("name")} />
      <NumberInput
        label="Vikt"
        description="Lämna tomt om underlaget inte anger någon vikt."
        value={draft.weight_percent}
        onChange={(weight_percent) => set({ weight_percent })}
        hasClear
        min={0}
        max={100}
        units="%"
        isOptional
        status={form.status("weight_percent")}
      />
      <TextArea
        label="Så bedöms det"
        value={draft.how_assessed}
        onChange={(how_assessed) => set({ how_assessed })}
        rows={3}
        status={form.status("how_assessed")}
      />
      <CitationFields
        citation={draft.citation}
        onChange={(citation) => set({ citation })}
        errors={form.errors}
        isSubmitted={form.isSubmitted}
        pageCount={pageCount}
      />
    </FormFrame>
  );
}

export function TermForm({ initial, label, isInPane, pageCount, onSave, onCancel }: ItemFormProps<TermExplanation>) {
  const form = useItemForm(initial, (value: TermExplanation) => termErrors(value, pageCount));
  const { draft, setDraft } = form;
  const set = (changes: Partial<TermExplanation>) => setDraft((previous) => ({ ...previous, ...changes }));
  return (
    <FormFrame
      label={label}
      submitLabel="Spara begreppet"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) =>
        onSave({
          ...value,
          term: value.term.trim(),
          explanation: value.explanation.trim(),
          citation: value.citation ? { ...value.citation, quote: value.citation.quote.trim() } : null,
        }),
      )}
    >
      <TextInput label="Ord eller begrepp" value={draft.term} onChange={(term) => set({ term })} status={form.status("term")} />
      <TextArea
        label="Vad det betyder i den här upphandlingen"
        value={draft.explanation}
        onChange={(explanation) => set({ explanation })}
        rows={3}
        status={form.status("explanation")}
      />
      <CheckboxInput
        label="Förklaringen har en källa i underlaget"
        value={draft.citation !== null}
        onChange={(hasSource) => set({ citation: hasSource ? emptyCitation() : null })}
      />
      {draft.citation && (
        <CitationFields
          citation={draft.citation}
          onChange={(citation) => set({ citation })}
          errors={form.errors}
          isSubmitted={form.isSubmitted}
          pageCount={pageCount}
        />
      )}
    </FormFrame>
  );
}

export function QuestionForm({ initial, label, isInPane, onSave, onCancel }: ItemFormProps<string>) {
  const form = useItemForm(initial, questionErrors);
  return (
    <FormFrame
      label={label}
      submitLabel="Spara oklarheten"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) => onSave(value.trim()))}
    >
      <TextArea
        label="Det här är oklart i underlaget"
        description="Företagen uppmanas att ställa frågan i e-Avrop före sista dag för frågor."
        value={form.draft}
        onChange={form.setDraft}
        rows={3}
        status={form.status("question")}
      />
    </FormFrame>
  );
}

export function SummaryForm({ initial, label, isInPane, onSave, onCancel }: ItemFormProps<string>) {
  const form = useItemForm(initial, summaryErrors);
  return (
    <FormFrame
      label={label}
      submitLabel="Spara sammanfattningen"
      isInPane={isInPane}
      formRef={form.formRef}
      onCancel={onCancel}
      onSubmit={form.submit((value) => onSave(value.trim()))}
    >
      <TextArea
        label="Sammanfattning för företagen"
        description="2–4 meningar med enkla ord: vad som upphandlas, var och när."
        value={form.draft}
        onChange={form.setDraft}
        rows={6}
        status={form.status("summary")}
      />
    </FormFrame>
  );
}
