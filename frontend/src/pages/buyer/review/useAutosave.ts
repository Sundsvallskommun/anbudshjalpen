import { useCallback, useRef, useState, type RefObject } from "react";
import { useUpdateChecklist } from "../../../api/queries";
import type { Checklist, ChecklistView } from "../../../api/types";

export type SaveState = "saved" | "saving" | "failed";

export interface Autosave {
  /** The working copy the page shows. */
  checklist: Checklist;
  /** The working copy as of now, for actions that run later (an "Ångra" in a toast). */
  latest: RefObject<Checklist>;
  /** Shows a change at once and saves it. */
  change: (next: Checklist) => void;
  state: SaveState;
  error: unknown;
  /** Sends what failed to save again. */
  retry: () => void;
  /** Resolves once every change is saved; rejects with the error when one cannot be. */
  flush: () => Promise<void>;
}

/**
 * Saves the buyer's edits as they are made (direction.md, section 4: "Ändringar sparas automatiskt med PUT, så att
 * citatkontrollen svarar direkt"). Saves run one at a time, newest change last; the backend's answer, with every
 * citation verified again, replaces the working copy unless the buyer has changed something since. The reviewer's
 * note is sent as it stands, so a save never erases it.
 */
export function useChecklistAutosave(view: ChecklistView): Autosave {
  const update = useUpdateChecklist(view.id);
  const [checklist, setChecklist] = useState<Checklist>(view.checklist);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<unknown>(null);
  const latest = useRef<Checklist>(view.checklist);
  const pending = useRef<Checklist | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const failure = useRef<unknown>(null);
  const note = useRef(view.reviewer_note);
  note.current = view.reviewer_note;
  const send = useRef(update.mutateAsync);
  send.current = update.mutateAsync;

  const run = useCallback(async () => {
    while (pending.current) {
      const sent = pending.current;
      pending.current = null;
      setState("saving");
      try {
        const saved = await send.current({ checklist: sent, reviewer_note: note.current });
        if (latest.current === sent) {
          latest.current = saved.checklist;
          setChecklist(saved.checklist);
        }
      } catch (caught) {
        pending.current ??= sent;
        failure.current = caught;
        setError(caught);
        setState("failed");
        return;
      }
    }
    failure.current = null;
    setError(null);
    setState("saved");
  }, []);

  const start = useCallback((): Promise<void> => {
    running.current ??= run().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [run]);

  const change = useCallback(
    (next: Checklist) => {
      latest.current = next;
      setChecklist(next);
      pending.current = next;
      void start();
    },
    [start],
  );

  const flush = useCallback(async () => {
    if (running.current) await running.current;
    if (pending.current) await start();
    if (pending.current) throw failure.current ?? new Error("Ändringarna kunde inte sparas.");
  }, [start]);

  const retry = useCallback(() => void start(), [start]);

  return { checklist, latest, change, state, error, retry, flush };
}
