import { Button } from "@astryxdesign/core/Button";
import { useToast } from "@astryxdesign/core/Toast";
import { useState } from "react";
import {
  useAdminChecklists,
  useApproveChecklist,
  useInterpretDocument,
  usePublishChecklist,
  useRejectChecklist,
  useReopenChecklist,
  useUpdateChecklist,
  useWithdrawChecklist,
} from "../../../api/queries";
import type { ChecklistView } from "../../../api/types";
import { errorMessage } from "../../../components/states";
import { nextToHandle } from "../queue";
import type { Autosave } from "./useAutosave";

export type DecisionDialog = "publish" | "reject" | "withdraw" | null;

/**
 * The buyer's decisions on a checklist and what follows them: every edit is saved first, the reviewer's note goes
 * with the approval, and each outcome is confirmed in a toast. After publishing, the toast offers the next checklist
 * to review.
 */
export function useDecisions(view: ChecklistView, autosave: Autosave) {
  const toast = useToast();
  const queue = useAdminChecklists("all");
  const update = useUpdateChecklist(view.id);
  const approve = useApproveChecklist(view.id);
  const publish = usePublishChecklist(view.id);
  const reject = useRejectChecklist(view.id);
  const withdraw = useWithdrawChecklist(view.id);
  const reopen = useReopenChecklist(view.id);
  const interpret = useInterpretDocument();
  const [dialog, setDialog] = useState<DecisionDialog>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<unknown>(null);

  const failed = (title: string, error: unknown) => toast({ body: `${title}. ${errorMessage(error)}`, type: "error" });

  const announcePublished = () => {
    const { next, remaining } = nextToHandle(queue.data ?? [], view.id);
    if (!next) {
      toast({ body: "Checklistan är publicerad." });
      return;
    }
    let dismiss: () => void = () => {};
    dismiss = toast({
      body: "Checklistan är publicerad.",
      // The way on stays until the buyer takes it or closes the message.
      isAutoHide: false,
      endContent: (
        <Button
          label={`Granska nästa (${remaining} kvar)`}
          size="sm"
          href={`/inkop/checklistor/${next.id}`}
          onClick={() => dismiss()}
        />
      ),
    });
  };

  /** Saves the edits and the note, approves a draft and publishes it. */
  const confirmPublish = async (note: string | null) => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      await autosave.flush();
      let status = view.status;
      if (note !== (view.reviewer_note ?? null)) {
        await update.mutateAsync({ checklist: autosave.latest.current, reviewer_note: note });
        status = "draft";
      }
      if (status === "draft") await approve.mutateAsync(undefined);
      await publish.mutateAsync(undefined);
      setDialog(null);
      announcePublished();
    } catch (error) {
      setPublishError(error);
    } finally {
      setIsPublishing(false);
    }
  };

  const approveOnly = async () => {
    try {
      await autosave.flush();
      await approve.mutateAsync(undefined);
      toast({ body: "Checklistan är godkänd. Företagen ser den när du publicerar den." });
    } catch (error) {
      failed("Checklistan kunde inte godkännas", error);
    }
  };

  const confirmReject = async (note: string) => {
    try {
      await autosave.flush();
      await reject.mutateAsync(note);
      setDialog(null);
      toast({ body: "Checklistan är avvisad." });
    } catch {
      // The dialog shows the error and stays open.
    }
  };

  const confirmWithdraw = (note: string) =>
    withdraw.mutate(note, {
      onSuccess: () => {
        setDialog(null);
        toast({ body: "Checklistan är tillbakadragen. Företagen ser den inte längre." });
      },
    });

  const reopenAsDraft = () =>
    reopen.mutate(undefined, {
      onSuccess: () => toast({ body: "Checklistan är ett utkast igen. Rätta den och godkänn den när den stämmer." }),
      onError: (error) => failed("Checklistan kunde inte öppnas som utkast", error),
    });

  const reinterpret = () =>
    interpret.mutate(view.document_id, {
      onSuccess: () =>
        toast({ body: "Underlaget tolkas igen. Det nya utkastet hamnar i Att granska när det är klart." }),
      onError: (error) => failed("Underlaget kunde inte tolkas igen", error),
    });

  const openDialog = (next: DecisionDialog) => {
    setPublishError(null);
    reject.reset();
    withdraw.reset();
    setDialog(next);
  };

  return {
    dialog,
    openDialog,
    closeDialog: () => setDialog(null),
    confirmPublish,
    isPublishing,
    publishError,
    approveOnly,
    confirmReject,
    rejectState: { isPending: reject.isPending, error: reject.isError ? reject.error : null },
    confirmWithdraw,
    withdrawState: { isPending: withdraw.isPending, error: withdraw.isError ? withdraw.error : null },
    reopenAsDraft,
    isReopening: reopen.isPending,
    reinterpret,
    queue: queue.data ?? [],
  };
}
