import { useCallback, useState } from "react";

/**
 * The ticks of step 4, kept in this browser per notice as a convenience (direction.md, section 4 "Steg 4 Lämna in").
 * Nothing depends on them: storage that is blocked or full only means the ticks are not remembered.
 */
const PREFIX = "anbudsklar.inlamning.";

function read(noticeId: string): string[] | null {
  try {
    const stored = window.localStorage.getItem(`${PREFIX}${noticeId}`);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : null;
  } catch {
    return null;
  }
}

function write(noticeId: string, values: readonly string[]) {
  try {
    window.localStorage.setItem(`${PREFIX}${noticeId}`, JSON.stringify(values));
  } catch {
    // Not remembered; the ticks still work for this visit.
  }
}

/** The ticked values, or null before the reader has ticked anything for this notice. */
export function useStoredChecks(noticeId: string): [string[] | null, (values: string[]) => void] {
  const [values, setValues] = useState<string[] | null>(() => read(noticeId));
  const update = useCallback(
    (next: string[]) => {
      setValues(next);
      write(noticeId, next);
    },
    [noticeId],
  );
  return [values, update];
}
