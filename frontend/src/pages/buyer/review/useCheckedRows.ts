import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "anbudsklar:granskning:";

function storageKey(checklistId: string): string {
  return `${STORAGE_PREFIX}${checklistId}`;
}

/** The marks saved for a checklist, or none when storage is empty, blocked or holds something else. */
export function readChecked(checklistId: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey(checklistId)) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

function writeChecked(checklistId: string, keys: ReadonlySet<string>) {
  try {
    if (keys.size === 0) window.localStorage.removeItem(storageKey(checklistId));
    else window.localStorage.setItem(storageKey(checklistId), JSON.stringify([...keys]));
  } catch {
    // A private window or blocked storage: the marks last as long as the page.
  }
}

export interface CheckedRows {
  checked: ReadonlySet<string>;
  setChecked: (key: string, isChecked: boolean) => void;
  /** Moves a mark to a row's new key after an edit changed it. */
  rename: (from: string, to: string) => void;
}

/**
 * The buyer's "Kontrollerad" marks on a checklist's rows. They are a working aid for the review, not part of the
 * checklist, so they are kept in this browser only (like the company's ticks before submitting, direction.md section
 * 4), per checklist.
 */
export function useCheckedRows(checklistId: string): CheckedRows {
  const [checked, setCheckedKeys] = useState<ReadonlySet<string>>(() => readChecked(checklistId));

  useEffect(() => writeChecked(checklistId, checked), [checklistId, checked]);

  const setChecked = useCallback((key: string, isChecked: boolean) => {
    setCheckedKeys((previous) => {
      if (previous.has(key) === isChecked) return previous;
      const next = new Set(previous);
      if (isChecked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const rename = useCallback((from: string, to: string) => {
    if (from === to) return;
    setCheckedKeys((previous) => {
      if (!previous.has(from)) return previous;
      const next = new Set(previous);
      next.delete(from);
      next.add(to);
      return next;
    });
  }, []);

  return { checked, setChecked, rename };
}
