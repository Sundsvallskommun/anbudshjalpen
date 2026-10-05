import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import {
  useAdminChecklist,
  useApproveChecklist,
  useInterpretDocument,
  useNotice,
  usePublishChecklist,
  useRejectChecklist,
  useUpdateChecklist,
  useWithdrawChecklist,
} from "../../api/queries";
import type { Checklist, ChecklistView, Requirement } from "../../api/types";
import {
  AttachmentsSection,
  DatesSection,
  EvaluationSection,
  OpenQuestionsSection,
  RequirementsSection,
  TermsSection,
  verificationSentence,
} from "../../components/checklist/ChecklistSections";
import { CitationViewerProvider } from "../../components/citations/CitationViewer";
import { ErrorNotice, Loading } from "../../components/states";
import { ChecklistStatusToken } from "../../components/tokens";
import { formatDateTime } from "../../lib/format";
import { engineLabel } from "../../lib/labels";
import { Page } from "../../shell/Page";
import { RequireRole } from "../../shell/RequireRole";
import { RequirementDialog } from "./RequirementDialog";

/** The next free id in the checklist's own scheme (K1, K2, …). */
export function nextRequirementId(requirements: readonly Requirement[]): string {
  const used = new Set(requirements.map((requirement) => requirement.id));
  let number = requirements.length + 1;
  while (used.has(`K${number}`)) number += 1;
  return `K${number}`;
}

function emptyRequirement(requirements: readonly Requirement[]): Requirement {
  return {
    id: nextRequirementId(requirements),
    kind: "skallkrav",
    title: "",
    plain_language: "",
    evidence: null,
    citation: { page: 1, quote: "", check: null, found_page: null },
  };
}

/** A destructive step that needs the buyer's reason: rejecting a draft or withdrawing a published checklist. */
function ReasonDialog({
  title,
  intro,
  submitLabel,
  errorTitle,
  isOpen,
  isPending,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  intro: string;
  submitLabel: string;
  errorTitle: string;
  isOpen: boolean;
  isPending: boolean;
  error: unknown;
  onSubmit: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (note.trim().length >= 3) onSubmit(note.trim());
  };
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={560} purpose="form">
      <form onSubmit={submit} aria-label={title}>
        <Layout
          header={<DialogHeader title={title} onOpenChange={(open) => !open && onClose()} />}
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Text>{intro}</Text>
                <TextArea label="Motivering" value={note} onChange={setNote} rows={4} maxLength={2000} />
                {error !== null && <ErrorNotice title={errorTitle} error={error} />}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end" wrap="wrap">
                <Button label="Avbryt" variant="ghost" onClick={onClose} />
                <Button
                  type="submit"
                  label={submitLabel}
                  variant="destructive"
                  isLoading={isPending}
                  isDisabled={note.trim().length < 3}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </form>
    </Dialog>
  );
}

/** A new draft from the same document, for example after a change of AI engine. This checklist stays as it is. */
function ReinterpretAction({ documentId }: { documentId: string }) {
  const interpret = useInterpretDocument();
  return (
    <VStack gap={2} hAlign="start">
      <Button
        label="Tolka underlaget igen"
        variant="ghost"
        isLoading={interpret.isPending}
        isDisabled={interpret.isSuccess}
        onClick={() => interpret.mutate(documentId)}
      />
      <Text color="secondary" role="status">
        {interpret.isSuccess
          ? "Underlaget tolkas igen. Det nya utkastet hamnar i granskningskön när det är klart."
          : "Ger ett nytt utkast från underlaget. Den här checklistan ändras inte."}
      </Text>
      {interpret.isError && <ErrorNotice title="Underlaget kunde inte tolkas igen" error={interpret.error} />}
    </VStack>
  );
}

/**
 * The buyer's review of one checklist draft: correct requirements and the summary, save (citations are
 * verified again), approve, publish or reject. A published checklist that turns out to be wrong is withdrawn
 * with a reason, and can then be corrected and published again. The working copy is local until saved.
 */
function ChecklistEditor({ view }: { view: ChecklistView }) {
  const [draft, setDraft] = useState<Checklist>(view.checklist);
  const [note, setNote] = useState(view.reviewer_note ?? "");
  const [editing, setEditing] = useState<{ requirement: Requirement; index: number | null } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const update = useUpdateChecklist(view.id);
  const approve = useApproveChecklist(view.id);
  const publish = usePublishChecklist(view.id);
  const reject = useRejectChecklist(view.id);
  const withdraw = useWithdrawChecklist(view.id);

  const isPublished = view.status === "published";
  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(view.checklist) || note.trim() !== (view.reviewer_note ?? "").trim();
  const failed = [update, approve, publish].find((mutation) => mutation.isError);
  const { citations_unverified: unverified, citations_moved: moved } = view.verification;

  const saveRequirement = (requirement: Requirement) => {
    setDraft((previous) => {
      const requirements = [...previous.requirements];
      if (editing?.index === null || editing?.index === undefined) requirements.push(requirement);
      else requirements[editing.index] = requirement;
      return { ...previous, requirements };
    });
    setEditing(null);
  };
  const removeRequirement = (index: number) =>
    setDraft((previous) => ({ ...previous, requirements: previous.requirements.filter((_, at) => at !== index) }));

  return (
    <VStack gap={8}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <ChecklistStatusToken status={view.status} />
          <Text color="secondary">
            {`Skapad ${formatDateTime(view.created_at)} av ${engineLabel(view.engine)}${view.model ? ` (${view.model})` : ""}.`}
          </Text>
        </HStack>
        <Text>{verificationSentence(view.verification)}</Text>
        {(unverified > 0 || moved > 0) && !isPublished && (
          <Banner
            status="warning"
            title={
              view.status === "approved"
                ? "Kontrollera citaten innan du publicerar"
                : "Kontrollera citaten innan du godkänner"
            }
            description="Citat som inte kunde kontrolleras eller som står på en annan sida är markerade. Öppna dem och rätta sidan eller citatet."
            collapsible={false}
          />
        )}
        {isPublished && view.published_at && (
          <Banner
            status="success"
            title={`Publicerad ${formatDateTime(view.published_at)}`}
            description="Företagen ser checklistan på upphandlingens sida. En publicerad checklista ändras inte, men den kan dras tillbaka."
            collapsible={false}
          />
        )}
        {view.status === "rejected" && view.reviewer_note && (
          <Banner status="error" title="Avvisad" description={view.reviewer_note} collapsible={false} />
        )}
      </VStack>

      {isPublished && (
        <VStack gap={3} as="section" aria-labelledby="published-actions">
          <Heading level={2} id="published-actions">
            Är checklistan fel?
          </Heading>
          <Text>
            Dra tillbaka den med en motivering. Företagen ser då den förra publicerade checklistan, om det finns någon,
            och du kan rätta den här och publicera den igen.
          </Text>
          <HStack>
            <Button label="Dra tillbaka" variant="destructive" onClick={() => setWithdrawing(true)} />
          </HStack>
          <ReinterpretAction documentId={view.document_id} />
        </VStack>
      )}

      {!isPublished && (
        <VStack gap={3} as="section" aria-labelledby="review-actions">
          <Heading level={2} id="review-actions">
            Granskning
          </Heading>
          <TextArea
            label="Anteckning från granskningen"
            description="Syns för inköp, inte för företagen."
            value={note}
            onChange={setNote}
            rows={2}
            maxLength={2000}
            isOptional
          />
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Button
              label="Spara ändringar"
              variant={isDirty ? "primary" : "secondary"}
              isDisabled={!isDirty}
              isLoading={update.isPending}
              onClick={() => update.mutate({ checklist: draft, reviewer_note: note.trim() || null })}
            />
            {view.status !== "approved" && (
              <Button
                label="Godkänn"
                isDisabled={isDirty}
                isLoading={approve.isPending}
                onClick={() => approve.mutate(undefined)}
              />
            )}
            {view.status === "approved" && (
              <Button
                label="Publicera för företagen"
                variant="primary"
                isDisabled={isDirty}
                isLoading={publish.isPending}
                onClick={() => publish.mutate(undefined)}
              />
            )}
            {view.status !== "rejected" && (
              <Button label="Avvisa" variant="destructive" onClick={() => setRejecting(true)} />
            )}
          </HStack>
          {isDirty && <Text color="secondary">Spara ändringarna innan du godkänner eller publicerar.</Text>}
          {failed && <ErrorNotice title="Det gick inte att genomföra" error={failed.error} />}
          <ReinterpretAction documentId={view.document_id} />
        </VStack>
      )}

      <VStack gap={3} as="section" aria-labelledby="review-summary">
        <Heading level={2} id="review-summary">
          Sammanfattning
        </Heading>
        {isPublished ? (
          <Text as="p">{draft.summary}</Text>
        ) : (
          <TextArea
            label="Sammanfattning för företagen"
            value={draft.summary}
            onChange={(summary) => setDraft((previous) => ({ ...previous, summary }))}
            rows={4}
          />
        )}
      </VStack>

      <RequirementsSection
        checklist={draft}
        documentId={view.document_id}
        actions={
          isPublished
            ? undefined
            : (requirement, index) => (
                <>
                  <Button
                    label={`Ändra ${requirement.title}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ requirement, index })}
                  >
                    Ändra
                  </Button>
                  <Button
                    label={`Ta bort ${requirement.title}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => removeRequirement(index)}
                  >
                    Ta bort
                  </Button>
                </>
              )
        }
        footer={
          isPublished ? undefined : (
            <HStack>
              <Button
                label="Lägg till krav"
                onClick={() => setEditing({ requirement: emptyRequirement(draft.requirements), index: null })}
              />
            </HStack>
          )
        }
      />
      <DatesSection checklist={draft} documentId={view.document_id} noticeId={view.notice_id} canRemind={false} />
      <AttachmentsSection checklist={draft} documentId={view.document_id} />
      <EvaluationSection checklist={draft} documentId={view.document_id} />
      <TermsSection checklist={draft} documentId={view.document_id} />
      <OpenQuestionsSection checklist={draft} />

      <RequirementDialog
        requirement={editing?.requirement ?? null}
        isNew={editing?.index === null}
        onSave={saveRequirement}
        onClose={() => setEditing(null)}
      />
      <ReasonDialog
        title="Avvisa checklistan"
        intro="Checklistan publiceras inte. Skriv varför, så att den kan göras om."
        submitLabel="Avvisa"
        errorTitle="Checklistan kunde inte avvisas"
        isOpen={rejecting}
        isPending={reject.isPending}
        error={reject.isError ? reject.error : null}
        onSubmit={(reason) => reject.mutate(reason, { onSuccess: () => setRejecting(false) })}
        onClose={() => setRejecting(false)}
      />
      <ReasonDialog
        title="Dra tillbaka checklistan"
        intro="Företagen, påminnelserna och Eneos assistenter slutar använda checklistan direkt. Skriv vad som är fel, så att den kan rättas."
        submitLabel="Dra tillbaka"
        errorTitle="Checklistan kunde inte dras tillbaka"
        isOpen={withdrawing}
        isPending={withdraw.isPending}
        error={withdraw.isError ? withdraw.error : null}
        onSubmit={(reason) => withdraw.mutate(reason, { onSuccess: () => setWithdrawing(false) })}
        onClose={() => setWithdrawing(false)}
      />
    </VStack>
  );
}

function Review() {
  const { id = "" } = useParams();
  const checklist = useAdminChecklist(id);
  const notice = useNotice(checklist.data?.notice_id ?? "");

  if (checklist.isPending) return <Loading label="Hämtar checklistan …" />;
  if (checklist.isError) {
    return (
      <Page title="Checklistan kunde inte visas">
        <ErrorNotice title="Checklistan kunde inte hämtas" error={checklist.error} onRetry={() => checklist.refetch()} />
        <Link href="/inkop" isStandalone>
          Till granskningskön
        </Link>
      </Page>
    );
  }

  const view = checklist.data;
  return (
    <CitationViewerProvider noticeId={view.notice_id} documents={notice.data?.documents ?? []}>
      <Page
        title="Granska checklistan"
        intro={
          <VStack gap={2}>
            {notice.data && <Text weight="semibold">{notice.data.title}</Text>}
            <HStack gap={4} wrap="wrap">
              <Link href={`/upphandlingar/${view.notice_id}`} isStandalone>
                Visa upphandlingen
              </Link>
              <Link href="/inkop" isStandalone>
                Till granskningskön
              </Link>
            </HStack>
          </VStack>
        }
      >
        {/* A saved or approved version replaces the working copy. */}
        <ChecklistEditor key={checklist.dataUpdatedAt} view={view} />
      </Page>
    </CitationViewerProvider>
  );
}

export default function ChecklistReviewPage() {
  return (
    <RequireRole role="inkopare" title="Granska checklista">
      {() => <Review />}
    </RequireRole>
  );
}
