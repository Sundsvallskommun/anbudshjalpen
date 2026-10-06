import { createContext, lazy, Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { NoticeDetail } from "../../../api/types";
import { SOURCE_PARAMS, targetFromParams, type DialogTarget, type DocumentTarget, type SourceTarget } from "./sourceTarget";

// The dialog (with its bottom sheet, pagination and page viewer) is fetched the first time a source is opened, so
// the pages that never open one do not load it.
const SourceDialog = lazy(() => import("./SourceDialog").then((module) => ({ default: module.SourceDialog })));

export interface SourceDialogApi {
  /** Opens a claim's source: the claim, the check in words and the page with the quote marked. */
  openSource: (target: SourceTarget) => void;
  /** Opens a document to read from a page ("Underlaget · 17 sidor"). */
  openDocument: (target: DocumentTarget) => void;
}

const SourceDialogContext = createContext<SourceDialogApi | null>(null);

/**
 * Owns the one source dialog of the app, so every "s. N" opens the same dialog wherever it is (WCAG 3.2.4). What it
 * shows and the page the reader leafed to live here, above the dialog, so closing it loses nothing. Mounted once in
 * AppProviders, inside the router and the query client.
 */
export function SourceDialogProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DialogTarget | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: DialogTarget) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTarget(next);
    setPage(null);
    setHasOpened(true);
  }, []);

  const api = useMemo<SourceDialogApi>(
    () => ({
      openSource: (next) => open({ kind: "source", ...next }),
      openDocument: (next) => open({ kind: "document", ...next }),
    }),
    [open],
  );

  return (
    <SourceDialogContext value={api}>
      {children}
      {hasOpened && (
        <Suspense fallback={null}>
          <SourceDialog target={target} page={page} onPageChange={setPage} onClose={() => setTarget(null)} openerRef={openerRef} />
        </Suspense>
      )}
    </SourceDialogContext>
  );
}

/** The app's source dialog. Throws outside SourceDialogProvider, which AppProviders always mounts. */
export function useSourceDialog(): SourceDialogApi {
  const api = use(SourceDialogContext);
  if (!api) throw new Error("useSourceDialog needs SourceDialogProvider (AppProviders mounts it)");
  return api;
}

/** The source dialog, or null outside its provider: for components that also render in isolation. */
export function useOptionalSourceDialog(): SourceDialogApi | null {
  return use(SourceDialogContext);
}

/**
 * Opens the source dialog that a notice page's address asks for: `?citat=…&sida=…&pastaende=…` (sourceHref) or the
 * old `?flik=underlag`. The parameters are taken out of the address once the dialog is open, so going back or
 * reloading does not open it again. Call it on the notice page once the notice has loaded.
 */
export function useSourceDeepLink(notice: NoticeDetail | undefined) {
  const [params, setParams] = useSearchParams();
  const { openSource, openDocument } = useSourceDialog();
  const target = notice ? targetFromParams(params, notice) : null;
  const key = target ? JSON.stringify(target) : null;

  useEffect(() => {
    if (!target) return;
    if (target.kind === "source") openSource(target);
    else openDocument(target);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const name of [SOURCE_PARAMS.quote, SOURCE_PARAMS.page, SOURCE_PARAMS.claim]) next.delete(name);
        if (next.get(SOURCE_PARAMS.step) === "underlag") next.delete(SOURCE_PARAMS.step);
        return next;
      },
      { replace: true },
    );
    // Runs once per requested target; the open functions are stable.
  }, [key]);
}
