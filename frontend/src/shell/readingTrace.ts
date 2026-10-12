import { useSyncExternalStore } from "react";

/** Where this browser keeps the choice to show "Så lästes underlaget" on every notice page. */
export const READING_TRACE_KEY = "anbudsklar.visa-lasning";

const listeners = new Set<() => void>();
// The choice while storage is blocked (a private window): it then lasts until the page is reloaded.
let unstored = false;

/** Whether the trace is shown: only when this browser has the choice stored; off is the default. */
export function readReadingTrace(): boolean {
  try {
    return window.localStorage.getItem(READING_TRACE_KEY) === "1";
  } catch {
    return unstored;
  }
}

/** Stores the choice and tells every open hook. Nothing is kept for the default, off. */
export function setReadingTrace(isShown: boolean): void {
  unstored = isShown;
  try {
    if (isShown) window.localStorage.setItem(READING_TRACE_KEY, "1");
    else window.localStorage.removeItem(READING_TRACE_KEY);
  } catch {
    // Storage can be blocked: the choice then lives in `unstored` until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Other tabs follow the choice, as they follow the appearance.
  const follow = (event: StorageEvent) => {
    if (event.key === READING_TRACE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", follow);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", follow);
  };
}

function serverSnapshot(): boolean {
  return false;
}

/**
 * The demo's switch "Visa hur underlaget lästes" and the way to change it. A convenience kept in this browser like
 * the appearance, not an account setting: whoever shows the demo turns it on once, and every notice page then has
 * the trace of its files.
 */
export function useReadingTrace(): [boolean, (isShown: boolean) => void] {
  const isShown = useSyncExternalStore(subscribe, readReadingTrace, serverSnapshot);
  return [isShown, setReadingTrace];
}
