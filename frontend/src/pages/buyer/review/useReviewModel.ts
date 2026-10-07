import { useMemo } from "react";
import type { Checklist, NoticeDeadlineKind } from "../../../api/types";
import { autoChecks, kindMismatches, needsCheck, rowHints, type AutoCheck } from "./checks";
import type { RowState } from "./ReviewList";
import { checklistRows, type ReviewRow } from "./rows";
import type { DocumentHeading } from "./sections";

export interface ReviewModel {
  rows: ReviewRow[];
  checks: AutoCheck[];
  states: RowState[];
  /**
   * The row the pane opens on before the buyer chooses one: the first whose source deviates, else the first. It is
   * known from the checklist alone, so it does not move while the page texts for the checks arrive.
   */
  defaultKey: string | null;
}

/** What the page derives from the working copy: its rows, the automatic checks, and what each row needs. */
export function useReviewModel({
  checklist,
  noticeDeadline,
  noticeDeadlineKind,
  headings,
  evaluationSection,
  changed,
  checked,
}: {
  checklist: Checklist;
  noticeDeadline: string | null;
  noticeDeadlineKind: NoticeDeadlineKind;
  headings: ReadonlyMap<string, string>;
  evaluationSection: DocumentHeading | null;
  changed: ReadonlySet<string>;
  checked: ReadonlySet<string>;
}): ReviewModel {
  const rows = useMemo(() => checklistRows(checklist), [checklist]);
  const context = useMemo(
    () => ({ checklist, rows, noticeDeadline, noticeDeadlineKind, headings, evaluationSection }),
    [checklist, rows, noticeDeadline, noticeDeadlineKind, headings, evaluationSection],
  );
  const checks = useMemo(() => autoChecks(context), [context]);
  const states = useMemo(() => {
    const mismatches = kindMismatches(context);
    return rows.map((row) => {
      const hints = rowHints(row, context, mismatches);
      return { row, hints, needsCheck: needsCheck(row, hints), isChanged: changed.has(row.key), isChecked: checked.has(row.key) };
    });
  }, [rows, context, changed, checked]);
  const defaultKey =
    rows.find((row) => row.citation?.check === "unverified" || row.citation?.check === "moved")?.key ??
    rows[0]?.key ??
    null;
  return { rows, checks, states, defaultKey };
}
