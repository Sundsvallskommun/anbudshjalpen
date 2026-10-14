import { Button } from "@astryxdesign/core/Button";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useConfig, useCreateNotice } from "../../api/queries";
import type { NoticeCreate, NoticeDeadlineKind, NoticeDetail } from "../../api/types";
import { DocumentUpload } from "../../components/DocumentUpload";
import { ErrorNotice } from "../../components/states";
import { splitList, swedishTimeToIso } from "../../lib/format";
import { noticeDeadlineLabel } from "../../lib/labels";

/** Today's names in LOU. "Förenklat förfarande" and "urvalsförfarande" left the law on 1 February 2022. */
export const PROCEDURES = [
  "Öppet förfarande",
  "Selektivt förfarande",
  "Förhandlat förfarande med föregående annonsering",
  "Förhandlat förfarande utan föregående annonsering",
  "Konkurrenspräglad dialog",
  "Innovationspartnerskap",
  "Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
  "Direktupphandling",
  "Dynamiskt inköpssystem",
];

/** The backend's limits (api/schemas.py NoticeCreate). */
const TITLE_MIN = 3;
const TITLE_MAX = 500;
const REFERENCE_MAX = 100;
const CPV_MAX = 30;
/** A CPV code as typed: eight digits, with or without the check digit. Shared with "Möjliga anbudsgivare". */
export const CPV_CODE = /^\d{8}(?:-\d)?$/u;

export interface NoticeDraft {
  title: string;
  buyer: string;
  /** The buyer's own number for the procurement (diarienummer), shown under the notice's heading. */
  reference: string;
  description: string;
  cpv: string;
  procedure: string | null;
  deadline: ISODateString | undefined;
  /** What the date is the last day for: tenders, or requests to participate in a restricted procedure. */
  deadlineKind: NoticeDeadlineKind;
  url: string;
}

export const EMPTY_DRAFT: NoticeDraft = {
  title: "",
  buyer: "",
  reference: "",
  description: "",
  cpv: "",
  procedure: null,
  deadline: undefined,
  deadlineKind: "tender",
  url: "",
};

type Field = "title" | "reference" | "cpv" | "url";

/** What must be fixed before the notice can be created, per field. */
export function noticeErrors(draft: NoticeDraft): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const title = draft.title.trim();
  if (title.length < TITLE_MIN) errors.title = "Skriv en rubrik på minst tre tecken.";
  else if (title.length > TITLE_MAX) errors.title = `Rubriken får vara högst ${TITLE_MAX} tecken.`;
  if (draft.reference.trim().length > REFERENCE_MAX) errors.reference = `Referensnumret får vara högst ${REFERENCE_MAX} tecken.`;
  const codes = splitList(draft.cpv);
  const wrong = codes.filter((code) => !CPV_CODE.test(code));
  if (wrong.length > 0) errors.cpv = `${wrong.join(", ")} är inte en CPV-kod. En kod har åtta siffror, till exempel 45442100.`;
  else if (codes.length > CPV_MAX) errors.cpv = `Ange högst ${CPV_MAX} CPV-koder.`;
  const url = draft.url.trim();
  if (url && !/^https?:\/\//iu.test(url)) errors.url = "Ange en webbadress som börjar med https://";
  return errors;
}

/** The request for a draft; the organisation's own name stands in for an empty buyer. */
export function noticeRequest(draft: NoticeDraft, organisation: string | undefined): NoticeCreate {
  return {
    title: draft.title.trim(),
    buyer: draft.buyer.trim() || organisation || null,
    reference_number: draft.reference.trim() || null,
    description: draft.description.trim() || null,
    cpv_codes: splitList(draft.cpv),
    procedure: draft.procedure,
    // A picked day closes at 23:59 Swedish time.
    deadline_at: draft.deadline ? swedishTimeToIso(draft.deadline, "23:59") : null,
    deadline_kind: draft.deadlineKind,
    url: draft.url.trim() || null,
  };
}

function Created({ notice, onAnother, onDone }: { notice: NoticeDetail; onAnother: () => void; onDone: () => void }) {
  return (
    <Layout
      content={
        <LayoutContent>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center" role="status">
              <Icon icon="success" color="success" />
              <Text weight="semibold">Upphandlingen är skapad.</Text>
            </HStack>
            <Link href={`/upphandlingar/${notice.id}`} isStandalone>
              {notice.title}
            </Link>
            <Text>Ladda upp förfrågningsunderlaget, så tas en checklista fram som du sedan granskar.</Text>
            <DocumentUpload noticeId={notice.id} />
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} hAlign="end" wrap="wrap">
            <Button label="Skapa en till" variant="ghost" onClick={onAnother} />
            <Button label="Klar" onClick={onDone} />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}

/**
 * "Ny upphandling" (direction.md, section 3: a secondary button in Inköp's header): a notice that does not come from
 * TED or e-Avrop, for example for a test, then its document. What the buyer has typed is kept while the dialog is
 * closed, until the notice is created.
 */
export function NewNoticeDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const config = useConfig();
  const create = useCreateNotice();
  const [draft, setDraft] = useState<NoticeDraft>(EMPTY_DRAFT);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [created, setCreated] = useState<NoticeDetail | null>(null);
  const errors = noticeErrors(draft);
  const status = (field: Field) => (isSubmitted && errors[field] ? { type: "error" as const, message: errors[field] } : undefined);
  const set = (changes: Partial<NoticeDraft>) => setDraft((previous) => ({ ...previous, ...changes }));

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    setIsSubmitted(false);
    setCreated(null);
    create.reset();
  };
  const close = () => {
    if (created) reset();
    onClose();
  };
  const onOpenChange = (open: boolean) => {
    if (!open) close();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
    if (Object.keys(errors).length > 0) {
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    create.mutate(noticeRequest(draft, config.data?.organization_name), { onSuccess: setCreated });
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={640} purpose="form">
      {/* The header is always mounted: the dialog takes its accessible name from the title. */}
      <Layout
        header={
          <DialogHeader
            title="Ny upphandling"
            subtitle="För underlag som inte kommer från TED eller e-Avrop, till exempel vid ett test."
            onOpenChange={onOpenChange}
          />
        }
        content={
          !isOpen ? undefined : created ? (
            <Created notice={created} onAnother={reset} onDone={close} />
          ) : (
            <form onSubmit={submit} aria-label="Ny upphandling" noValidate>
              <Layout
                content={
                  <LayoutContent>
                    <VStack gap={4}>
                      <FormLayout defaultOptionality="optional">
                        <TextInput
                          label="Rubrik"
                          value={draft.title}
                          onChange={(title) => set({ title })}
                          isRequired
                          status={status("title")}
                        />
                        <TextInput
                          label="Upphandlande organisation"
                          description={
                            config.data?.organization_name
                              ? `Lämna tomt för ${config.data.organization_name}.`
                              : undefined
                          }
                          value={draft.buyer}
                          onChange={(buyer) => set({ buyer })}
                        />
                        <TextInput
                          label="Referensnummer"
                          description="Ert nummer för upphandlingen, till exempel diarienumret. Visas under rubriken."
                          value={draft.reference}
                          onChange={(reference) => set({ reference })}
                          status={status("reference")}
                        />
                        <TextArea
                          label="Beskrivning"
                          value={draft.description}
                          onChange={(description) => set({ description })}
                          rows={4}
                          maxLength={8000}
                        />
                        <TextInput
                          label="CPV-koder"
                          description="Åtta siffror, separera med kommatecken."
                          value={draft.cpv}
                          onChange={(cpv) => set({ cpv })}
                          status={status("cpv")}
                        />
                        <Selector
                          label="Förfarande"
                          options={PROCEDURES}
                          value={draft.procedure}
                          onChange={(procedure) => set({ procedure })}
                          hasClear
                        />
                        <RadioList
                          label="Datumet gäller"
                          description="I ett selektivt förfarande anger annonsen sista dag för anbudsansökan. Sista anbudsdag står då i inbjudan."
                          orientation="horizontal"
                          value={draft.deadlineKind}
                          onChange={(kind) => set({ deadlineKind: kind === "request" ? "request" : "tender" })}
                        >
                          <RadioListItem label="Anbud" value="tender" />
                          <RadioListItem label="Anbudsansökan" value="request" />
                        </RadioList>
                        <DateInput
                          label={noticeDeadlineLabel({ deadline_kind: draft.deadlineKind })}
                          description="Dagen gäller till kl. 23:59."
                          value={draft.deadline}
                          onChange={(deadline) => set({ deadline })}
                          weekStartsOn="mon"
                          hasClear
                          // The native picker probes the engine with an injected <style>, which the strict CSP blocks.
                          nativePicker="never"
                        />
                        <TextInput
                          label="Länk till annonsen"
                          value={draft.url}
                          onChange={(url) => set({ url })}
                          status={status("url")}
                        />
                      </FormLayout>
                      {create.isError && <ErrorNotice title="Upphandlingen kunde inte skapas" error={create.error} />}
                    </VStack>
                  </LayoutContent>
                }
                footer={
                  <LayoutFooter hasDivider>
                    <HStack gap={2} hAlign="end" wrap="wrap">
                      <Button label="Avbryt" variant="ghost" onClick={close} />
                      <Button type="submit" label="Skapa upphandlingen" variant="primary" isLoading={create.isPending} />
                    </HStack>
                  </LayoutFooter>
                }
              />
            </form>
          )
        }
      />
    </Dialog>
  );
}
