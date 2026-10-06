import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { createContext, use, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Citation } from "../../../../api/types";
import { fieldStatus, hasErrors, QUOTE_MAX, type Errors } from "./validation";

/** What the source pane offers a form beside it; absent when the form is in a dialog. */
export interface PaneTools {
  /** The text marked on the page the pane shows, with that page; null when nothing is marked there. */
  readSelection: () => { text: string; page: number } | null;
  /** Whether the form's quote is on the page the pane shows; null while that page is loading. */
  quoteFound: boolean | null;
  /** The form's citation as it is being edited, so the pane shows its page and marks its quote. */
  onCitationChange: (citation: Pick<Citation, "page" | "quote"> | null) => void;
}

export const PaneToolsContext = createContext<PaneTools | null>(null);

/**
 * A form's working copy and its errors. Errors show once the form has been sent (the button is always active), and
 * sending a form with errors moves focus to the first field to fix.
 */
export function useItemForm<T, F extends string>(initial: T, validate: (value: T) => Errors<F>) {
  const [draft, setDraft] = useState<T>(initial);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = validate(draft);

  const submit = (onValid: (value: T) => void) => (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitted(true);
    if (hasErrors(errors)) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    onValid(draft);
  };

  const status = (field: F) => fieldStatus(isSubmitted, errors[field]);
  return { draft, setDraft, errors, isSubmitted, submit, status, formRef };
}

/** The frame of every item form: its fields, then "Spara" and "Avbryt". */
export function FormFrame({
  label,
  submitLabel,
  isInPane,
  formRef,
  onSubmit,
  onCancel,
  children,
}: {
  label: string;
  submitLabel: string;
  /** Beside the source the form is not the view's main action, so its button is secondary. */
  isInPane: boolean;
  formRef: React.Ref<HTMLFormElement>;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-label={label} noValidate>
      <VStack gap={4}>
        <FormLayout defaultOptionality="required">{children}</FormLayout>
        <HStack gap={2} wrap="wrap" hAlign={isInPane ? "start" : "end"}>
          <Button type="submit" label={submitLabel} variant={isInPane ? "secondary" : "primary"} />
          <Button label="Avbryt" variant="ghost" onClick={onCancel} />
        </HStack>
      </VStack>
    </form>
  );
}

/** The line under the quote: whether the quote is on the page beside the form ("Citatet står på sida 4"). */
function QuoteCheck({ found, page }: { found: boolean; page: number }) {
  return (
    <HStack gap={1} vAlign="center">
      <Icon icon={found ? "success" : "warning"} color={found ? "success" : "warning"} size="sm" />
      <Text type="supporting" color="primary">
        {found ? `Citatet står på sida ${page}.` : `Citatet hittades inte på sida ${page}. Kontrollera sidan och orden.`}
      </Text>
    </HStack>
  );
}

/**
 * The page and quote of an item's source. Beside the source pane the pane follows what is typed: it shows the page,
 * marks the quote and says whether it is there, and text marked on the page can become the quote. A changed source
 * loses its earlier verification; the backend verifies it again when the change is saved.
 */
export function CitationFields({
  citation,
  onChange,
  errors,
  isSubmitted,
  pageCount,
}: {
  citation: Citation;
  onChange: (citation: Citation) => void;
  errors: Errors<"page" | "quote">;
  isSubmitted: boolean;
  pageCount?: number;
}) {
  const tools = use(PaneToolsContext);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const reportCitation = tools?.onCitationChange;

  useEffect(() => {
    reportCitation?.({ page: citation.page, quote: citation.quote });
  }, [reportCitation, citation.page, citation.quote]);
  useEffect(() => () => reportCitation?.(null), [reportCitation]);

  const set = (changes: Partial<Pick<Citation, "page" | "quote">>) =>
    onChange({ ...citation, ...changes, check: null, found_page: null });

  const takeSelection = () => {
    const selection = tools?.readSelection();
    if (!selection) {
      setSelectionMessage("Markera först texten på sidan, sedan kan den bli citat.");
      return;
    }
    if (selection.text.length > QUOTE_MAX) {
      setSelectionMessage(`Markeringen är ${selection.text.length} tecken. Ett citat får vara högst ${QUOTE_MAX}.`);
      return;
    }
    setSelectionMessage(null);
    set({ quote: selection.text, page: selection.page });
  };

  const quoteIsChecked = tools && tools.quoteFound !== null && citation.quote.trim().length >= 3;
  return (
    <>
      <NumberInput
        label="Sida i underlaget"
        value={citation.page}
        onChange={(page) => set({ page })}
        min={1}
        max={pageCount && pageCount > 0 ? pageCount : null}
        isIntegerOnly
        status={fieldStatus(isSubmitted, errors.page)}
      />
      <VStack gap={2}>
        <TextArea
          label="Citat från sidan"
          description="Kopiera texten ordagrant, så kan den kontrolleras mot underlaget."
          value={citation.quote}
          onChange={(quote) => set({ quote })}
          rows={3}
          maxLength={QUOTE_MAX}
          status={fieldStatus(isSubmitted, errors.quote)}
        />
        {quoteIsChecked && <QuoteCheck found={tools.quoteFound === true} page={citation.page} />}
        {tools && (
          <VStack gap={1} hAlign="start">
            <Button label="Använd markeringen som citat" size="sm" variant="ghost" onClick={takeSelection} />
            <Text type="supporting" role="status">
              {selectionMessage ?? "Markera texten på sidan intill och tryck här."}
            </Text>
          </VStack>
        )}
      </VStack>
    </>
  );
}
