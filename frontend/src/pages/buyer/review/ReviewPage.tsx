import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Citation, ChecklistView, NoticeDetail } from "../../../api/types";
import { Page, type Crumb } from "../../../shell/Page";
import { AutoChecks } from "./AutoChecks";
import { summaryIssue, type CheckTarget } from "./checks";
import { ActionBar } from "./ActionBar";
import { PublishDialog, ReasonDialog } from "./DecisionDialogs";
import { editKey, editTitle, ItemEditor, type EditTarget } from "./forms/ItemEditor";
import { allPages, citedPages, usePageTexts, useRequirementHeadings } from "./PageTexts";
import { ListGroups, ListToolbar, SummaryBlock, type RowFilter } from "./ReviewList";
import { isWithdrawn, ReviewFacts, StatusStepper } from "./ReviewHeader";
import {
  checklistRows,
  groupInfo,
  groupOf,
  ITEM_NOUN,
  newItem,
  withItem,
  withItemInserted,
  withoutItem,
  type ReviewRow,
  type RowItem,
  type RowSection,
} from "./rows";
import { evaluationHeading } from "./sections";
import { SourcePane, type PaneFocus } from "./SourcePane";
import { useChecklistAutosave } from "./useAutosave";
import { useCheckedRows } from "./useCheckedRows";
import { useDecisions } from "./useDecisions";
import { useReviewModel } from "./useReviewModel";
import { WIDE_QUERY, Workbench } from "./Workbench";

/** The CSS selector of a row by its key. */
function rowSelector(key: string): string {
  return `[data-row="${key.replace(/["\\]/gu, "\\$&")}"]`;
}

/** Moves focus to a row's own control once it is on screen, after a form closes or a row is removed. */
function focusRow(key: string | null) {
  requestAnimationFrame(() => {
    const row = key ? document.querySelector<HTMLElement>(rowSelector(key)) : null;
    row?.querySelector<HTMLElement>("button, input, a")?.focus();
  });
}

/** Moves focus into the form beside the list once it is on screen. */
function focusPaneEditor() {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>("[data-pane-editor] input, [data-pane-editor] textarea, [data-pane-editor] button")
      ?.focus();
  });
}

function sameCitation(a: Pick<Citation, "page" | "quote"> | null, b: Pick<Citation, "page" | "quote"> | null): boolean {
  return a === b || (a !== null && b !== null && a.page === b.page && a.quote === b.quote);
}

/** What the edited item's source is, for the pane: as typed in the form, else as saved. */
function editedCitation(target: EditTarget, typed: Pick<Citation, "page" | "quote"> | null): PaneFocus["citation"] {
  if (typed) return { ...typed, check: null, found_page: null, document: null, document_id: null };
  if (target.mode === "summary" || target.item.section === "question") return null;
  return target.item.value.citation;
}

/** The way up from a review: Inköp › Att granska. */
export const REVIEW_TRAIL: readonly Crumb[] = [
  { label: "Inköp", href: "/inkop" },
  { label: "Att granska", href: "/inkop?flik=granska" },
];

export interface ReviewPageProps {
  view: ChecklistView;
  notice: NoticeDetail | undefined;
}

/**
 * The buyer's review table for one checklist (direction.md, section 4 "Inköp: Granska checklista"): the header with
 * the status and the facts, the automatic checks, the list beside its source, and the decision last. Edits are saved
 * as they are made.
 */
export function ReviewPage({ view, notice }: ReviewPageProps) {
  const autosave = useChecklistAutosave(view);
  const { checklist } = autosave;
  const checkedRows = useCheckedRows(view.id);
  const decisions = useDecisions(view, autosave);
  const toast = useToast();
  const hasPane = useMediaQuery(WIDE_QUERY);
  const isEditable = view.status === "draft" || view.status === "approved";
  const documentInfo = notice?.documents.find((document) => document.id === view.document_id);
  const pageCount = documentInfo?.page_count ?? 0;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [filter, setFilter] = useState<RowFilter>("alla");
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set());
  const [typedCitation, setTypedCitation] = useState<Pick<Citation, "page" | "quote"> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);

  // The checks read the pages the requirements cite, and the whole document when it has to find where evaluation is
  // described. The pages are shared with the pane, so each is fetched once.
  const hasNoEvaluation = checklist.evaluation.length === 0;
  const pagesToRead = useMemo(
    () =>
      !documentInfo || !isEditable
        ? []
        : hasNoEvaluation
          ? allPages(pageCount)
          : citedPages(checklist.requirements, pageCount),
    [documentInfo, isEditable, hasNoEvaluation, pageCount, checklist.requirements],
  );
  const texts = usePageTexts(view.notice_id, documentInfo?.id, pagesToRead);
  const headings = useRequirementHeadings(checklist.requirements, texts);
  const evaluationSection = useMemo(() => (hasNoEvaluation ? evaluationHeading(texts) : null), [hasNoEvaluation, texts]);
  const { rows, checks, states, defaultKey } = useReviewModel({
    checklist,
    noticeDeadline: notice?.deadline_at ?? null,
    noticeDeadlineKind: notice?.deadline_kind ?? "tender",
    headings,
    evaluationSection,
    changed,
    checked: checkedRows.checked,
  });
  const checkedCount = states.filter((state) => state.isChecked).length;
  const hasEarlierPublished = decisions.queue.some(
    (item) => item.notice_id === view.notice_id && item.id !== view.id && item.status === "published",
  );
  // Beside the pane one row is always shown: the chosen one, else the default.
  const shownKey = selectedKey ?? defaultKey;
  const shownRow = rows.find((row) => row.key === shownKey) ?? null;

  // The row the pane opens on may be far down the list: scroll the list's own box to it once, not the window.
  const hasScrolledToShown = useRef(false);
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (!hasPane || !box || !shownKey || hasScrolledToShown.current) return;
    const row = box.querySelector<HTMLElement>(rowSelector(shownKey));
    if (!row) return;
    hasScrolledToShown.current = true;
    const rowBox = row.getBoundingClientRect();
    const listBox = box.getBoundingClientRect();
    // A row already in view stays where it is, so the list still starts at its summary.
    if (rowBox.top >= listBox.top && rowBox.bottom <= listBox.bottom) return;
    box.scrollTop += rowBox.top - listBox.top - box.clientHeight / 3;
  }, [hasPane, shownKey]);

  const onCitationChange = useCallback((citation: Pick<Citation, "page" | "quote"> | null) => {
    setTypedCitation((previous) => (sameCitation(previous, citation) ? previous : citation));
  }, []);

  const markChanged = (key: string) => setChanged((previous) => new Set(previous).add(key));

  const select = (row: ReviewRow) => {
    if (editing && !(editing.mode === "edit" && editing.key === row.key)) setEditing(null);
    setSelectedKey(row.key);
  };
  const startEditing = (target: EditTarget) => {
    setEditing(target);
    if (hasPane) focusPaneEditor();
  };
  const edit = (row: ReviewRow) => {
    setSelectedKey(row.key);
    startEditing({ mode: "edit", key: row.key, index: row.index, item: row.item });
  };
  /** Opens the form for a new item, its source on the page the check points at or the page being read. */
  const add = (section: RowSection, from: Pick<Extract<CheckTarget, { kind: "add" }>, "date" | "page"> = {}) => {
    const empty = newItem(checklist, section, from.page ?? shownRow?.citation?.page ?? 1);
    const item: RowItem =
      empty.section === "date" && from.date ? { section: "date", value: { ...empty.value, ...from.date } } : empty;
    startEditing({ mode: "add", item });
  };
  const editSummary = () => startEditing({ mode: "summary", summary: checklist.summary });

  /** Saves an item and keeps its marks and selection on it, though its key may change with what was edited. */
  const saveItem = (item: RowItem) => {
    if (!editing || editing.mode === "summary") return;
    const index = editing.mode === "edit" ? editing.index : null;
    const next = withItem(checklist, item, index);
    const nextRows = checklistRows(next);
    const listIndex = index ?? nextRows.filter((row) => row.item.section === item.section).length - 1;
    const saved = nextRows.find((row) => row.item.section === item.section && row.index === listIndex);
    if (saved) {
      if (editing.mode === "edit") checkedRows.rename(editing.key, saved.key);
      markChanged(saved.key);
      setSelectedKey(saved.key);
    }
    autosave.change(next);
    setEditing(null);
    focusRow(saved?.key ?? null);
  };
  const saveSummary = (summary: string) => {
    autosave.change({ ...checklist, summary });
    setEditing(null);
  };
  const cancelEdit = () => {
    const key = editing?.mode === "edit" ? editing.key : null;
    setEditing(null);
    focusRow(key);
  };

  const remove = (row: ReviewRow) => {
    const position = rows.indexOf(row);
    autosave.change(withoutItem(checklist, row.item.section, row.index));
    if (selectedKey === row.key) setSelectedKey(null);
    if (editing?.mode === "edit" && editing.key === row.key) setEditing(null);
    focusRow(rows[position + 1]?.key ?? rows[position - 1]?.key ?? null);
    let dismiss: () => void = () => {};
    dismiss = toast({
      body: ITEM_NOUN[row.item.section].removed,
      // "Ångra" stays until the buyer uses it or closes the message.
      isAutoHide: false,
      uniqueID: "granskning-borttagen",
      endContent: (
        <Button
          label="Ångra"
          size="sm"
          onClick={() => {
            autosave.change(withItemInserted(autosave.latest.current, row.item, row.index));
            dismiss();
          }}
        />
      ),
    });
  };

  const runCheck = (target: CheckTarget) => {
    if (target.kind === "summary") editSummary();
    else if (target.kind === "add") add(target.section, target);
    else if (target.kind === "edit") {
      const row = rows.find((candidate) => candidate.key === target.key);
      if (row) edit(row);
    } else {
      setFilter("kontroll");
      requestAnimationFrame(() => listRef.current?.scrollIntoView?.({ block: "start" }));
    }
  };

  const editor = editing ? (
    <ItemEditor
      key={editKey(editing)}
      target={editing}
      isInPane={hasPane}
      pageCount={pageCount}
      onSaveItem={saveItem}
      onSaveSummary={saveSummary}
      onCancel={cancelEdit}
    />
  ) : null;

  const paneFocus: PaneFocus | null =
    editing && editing.mode !== "summary"
      ? {
          key: editKey(editing),
          claim: editTitle(editing),
          group: groupInfo(groupOf(editing.item)).title,
          citation: editedCitation(editing, typedCitation),
        }
      : shownRow
        ? { key: shownRow.key, claim: shownRow.title, group: groupInfo(shownRow.group).title, citation: shownRow.citation }
        : null;

  const noticeTitle = notice?.title;
  const editingKey = editing?.mode === "edit" ? editing.key : null;
  return (
    <Page
      width={1344}
      title={noticeTitle ? `Granska checklista: ${noticeTitle}` : "Granska checklista"}
      heading={noticeTitle ?? "Granska checklista"}
      eyebrow={noticeTitle ? "Granska checklista" : undefined}
      breadcrumbs={REVIEW_TRAIL}
      actions={<StatusStepper view={view} hasEarlierPublished={hasEarlierPublished} />}
      intro={
        <Link href={`/upphandlingar/${view.notice_id}`} isStandalone>
          Visa upphandlingen som företagen ser den
        </Link>
      }
    >
      <ReviewFacts view={view} checklist={checklist} notice={notice} documentInfo={documentInfo} />

      {view.status === "rejected" && (
        <Banner
          status="error"
          title={isWithdrawn(view) ? "Tillbakadragen" : "Avvisad"}
          description={view.reviewer_note ?? "Ingen motivering angavs."}
          collapsible={false}
          endContent={
            <Button
              label="Öppna som utkast igen"
              variant="primary"
              isLoading={decisions.isReopening}
              onClick={decisions.reopenAsDraft}
            />
          }
        />
      )}
      {isEditable && view.reviewer_note && (
        <Banner status="info" title="Anteckning från granskningen" description={view.reviewer_note} collapsible={false} />
      )}

      <VStack ref={listRef} gap={0}>
        <Workbench
          hasPane={hasPane}
          top={isEditable ? <AutoChecks checks={checks} onAction={runCheck} /> : undefined}
          listRef={scrollBoxRef}
          toolbar={
            <ListToolbar filter={filter} onFilterChange={setFilter} states={states} isEditable={isEditable} onAdd={(section) => add(section)} />
          }
          list={
            <>
              <SummaryBlock
                summary={checklist.summary}
                issue={isEditable ? summaryIssue(checklist.summary) : null}
                isEditable={isEditable}
                hasPane={hasPane}
                onEdit={editSummary}
              />
              <ListGroups
                states={states}
                filter={filter}
                noticeId={view.notice_id}
                documentId={view.document_id}
                selectedKey={shownKey}
                editingKey={editingKey}
                isEditable={isEditable}
                hasPane={hasPane}
                onSelect={select}
                onCheckedChange={(row, isChecked) => checkedRows.setChecked(row.key, isChecked)}
                onEdit={edit}
                onRemove={remove}
              />
            </>
          }
          pane={
            <SourcePane
              noticeId={view.notice_id}
              documentInfo={documentInfo}
              focus={paneFocus}
              editor={hasPane ? editor : undefined}
              editorTitle={editing ? editTitle(editing) : undefined}
              onCitationChange={onCitationChange}
            />
          }
        />
      </VStack>

      <ActionBar
        view={view}
        checked={checkedCount}
        total={rows.length}
        saveState={autosave.state}
        saveError={autosave.error}
        onRetrySave={autosave.retry}
        onPublish={() => decisions.openDialog("publish")}
        onApproveOnly={() => void decisions.approveOnly()}
        onReject={() => decisions.openDialog("reject")}
        onWithdraw={() => decisions.openDialog("withdraw")}
        onReinterpret={decisions.reinterpret}
      />

      <EditDialog target={hasPane ? null : editing} onClose={cancelEdit}>
        {hasPane ? null : editor}
      </EditDialog>
      <PublishDialog
        isOpen={decisions.dialog === "publish"}
        needsApproval={view.status === "draft"}
        checklist={checklist}
        note={view.reviewer_note}
        uncheckedCount={rows.length - checkedCount}
        hasEarlierPublished={hasEarlierPublished}
        isPending={decisions.isPublishing}
        error={decisions.publishError}
        onConfirm={(note) => void decisions.confirmPublish(note)}
        onClose={decisions.closeDialog}
      />
      <ReasonDialog
        key={`avvisa-${view.status}`}
        isOpen={decisions.dialog === "reject"}
        title="Avvisa checklistan"
        intro="Checklistan publiceras inte. Skriv varför, så att den kan rättas eller tolkas om."
        submitLabel="Avvisa"
        errorTitle="Checklistan kunde inte avvisas"
        isPending={decisions.rejectState.isPending}
        error={decisions.rejectState.error}
        onSubmit={(note) => void decisions.confirmReject(note)}
        onClose={decisions.closeDialog}
      />
      <ReasonDialog
        key={`dra-tillbaka-${view.status}`}
        isOpen={decisions.dialog === "withdraw"}
        title="Dra tillbaka checklistan"
        intro="Företagen, påminnelserna och Eneos assistenter slutar använda checklistan direkt. Skriv vad som är fel, så att den kan rättas."
        submitLabel="Dra tillbaka"
        errorTitle="Checklistan kunde inte dras tillbaka"
        isPending={decisions.withdrawState.isPending}
        error={decisions.withdrawState.error}
        onSubmit={decisions.confirmWithdraw}
        onClose={decisions.closeDialog}
      />

    </Page>
  );
}

/** The form in a dialog below 1 200 px, where there is no pane beside the list. */
function EditDialog({
  target,
  onClose,
  children,
}: {
  target: EditTarget | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const lastTitle = useRef("Ändra");
  if (target) lastTitle.current = editTitle(target);
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <Dialog isOpen={target !== null} onOpenChange={onOpenChange} width={640} purpose="form">
      {/* The header is always mounted: the dialog takes its accessible name from the title. */}
      <Layout
        header={<DialogHeader title={lastTitle.current} onOpenChange={onOpenChange} />}
        content={children ? <LayoutContent>{children}</LayoutContent> : undefined}
      />
    </Dialog>
  );
}
