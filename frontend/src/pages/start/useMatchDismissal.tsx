import { Button } from "@astryxdesign/core/Button";
import { useToast } from "@astryxdesign/core/Toast";
import { useState } from "react";
import { useDismissMatch, useRestoreMatch } from "../../api/queries";
import type { MatchView } from "../../api/types";
import { errorMessage } from "../../components/states";

export interface MatchDismissal {
  /** Matches dismissed in this visit, hidden at once while the list is fetched again. */
  hiddenIds: ReadonlySet<string>;
  dismiss: (match: MatchView) => void;
  /** The match whose dismissal is on its way, for the button's spinner. */
  dismissingId: string | null;
}

/**
 * "Inte intressant" with a way back: the match leaves the list, and a toast says so with "Ångra" (direction.md,
 * section 4 "Start": Toast "Dold · Ångra"). The toast stays until it is closed, since undoing is the only way back
 * and a toast that hides itself would be a time limit (WCAG 2.2.1).
 */
export function useMatchDismissal({
  onDismissed,
  onRestored,
}: {
  onDismissed?: (match: MatchView) => void;
  onRestored?: (match: MatchView) => void;
} = {}): MatchDismissal {
  const dismissMutation = useDismissMatch();
  const restoreMutation = useRestoreMatch();
  const toast = useToast();
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());

  const setHidden = (id: string, isHidden: boolean) =>
    setHiddenIds((current) => {
      const next = new Set(current);
      if (isHidden) next.add(id);
      else next.delete(id);
      return next;
    });

  const restore = (match: MatchView, closeToast: () => void) =>
    restoreMutation.mutate(match.id, {
      onSuccess: () => {
        setHidden(match.id, false);
        closeToast();
        onRestored?.(match);
      },
      onError: (error) => toast({ type: "error", body: `Det gick inte att ångra. ${errorMessage(error)}` }),
    });

  const dismiss = (match: MatchView) =>
    dismissMutation.mutate(match.id, {
      onSuccess: () => {
        setHidden(match.id, true);
        onDismissed?.(match);
        let closeToast = () => {};
        closeToast = toast({
          body: `Dold: ${match.notice.title}`,
          endContent: (
            <Button
              label={`Ångra: ${match.notice.title}`}
              size="sm"
              onClick={() => restore(match, () => closeToast())}
            >
              Ångra
            </Button>
          ),
          isAutoHide: false,
          uniqueID: `dold-${match.id}`,
        });
      },
      onError: (error) => toast({ type: "error", body: errorMessage(error) }),
    });

  return {
    hiddenIds,
    dismiss,
    dismissingId: dismissMutation.isPending ? (dismissMutation.variables ?? null) : null,
  };
}
