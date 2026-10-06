import { describe, expect, it } from "vitest";
import type { ChecklistAdminItem } from "../../api/types";
import { checklistAdminItem } from "../../test/fixtures";
import { isInView, itemsInView, nextToHandle, sourceCounts, supersededIds } from "./queue";

function item(id: string, changes: Partial<ChecklistAdminItem> = {}): ChecklistAdminItem {
  return { ...checklistAdminItem, id, ...changes };
}

describe("queue views", () => {
  it("lists drafts and approved checklists under Att hantera, so nothing stops before publication", () => {
    expect(isInView({ status: "draft" }, "hantera")).toBe(true);
    expect(isInView({ status: "approved" }, "hantera")).toBe(true);
    expect(isInView({ status: "published" }, "hantera")).toBe(false);
    expect(isInView({ status: "rejected" }, "avvisade")).toBe(true);
    expect(isInView({ status: "published" }, "publicerade")).toBe(true);
    expect(isInView({ status: "rejected" }, "alla")).toBe(true);
  });

  it("keeps the backend's order within a view", () => {
    const items = [item("a", { status: "draft" }), item("b", { status: "published" }), item("c", { status: "approved" })];
    expect(itemsInView(items, "hantera").map(({ id }) => id)).toEqual(["a", "c"]);
  });
});

describe("supersededIds", () => {
  it("marks an older draft when the notice has a newer interpretation that is not rejected", () => {
    const older = item("older", { created_at: "2026-10-01T08:00:00Z" });
    const newer = item("newer", { created_at: "2026-10-05T08:00:00Z" });
    expect([...supersededIds([older, newer])]).toEqual(["older"]);
  });

  it("does not count a rejected newer checklist or another notice's", () => {
    const older = item("older", { created_at: "2026-10-01T08:00:00Z" });
    const rejected = item("rejected", { status: "rejected", created_at: "2026-10-05T08:00:00Z" });
    const elsewhere = item("elsewhere", { notice_id: "other", created_at: "2026-10-06T08:00:00Z" });
    expect(supersededIds([older, rejected, elsewhere]).size).toBe(0);
  });

  it("never marks a published checklist", () => {
    const published = item("published", { status: "published", created_at: "2026-10-01T08:00:00Z" });
    const newer = item("newer", { created_at: "2026-10-05T08:00:00Z" });
    expect(supersededIds([published, newer]).has("published")).toBe(false);
  });
});

describe("sourceCounts", () => {
  it("counts quotes found on another page as found but still to check", () => {
    expect(
      sourceCounts({ citations_total: 41, citations_verified: 38, citations_moved: 1, citations_unverified: 2 }),
    ).toEqual({ found: 39, total: 41, toCheck: 3 });
  });
});

describe("nextToHandle", () => {
  it("offers the first other checklist still to act on, with how many remain", () => {
    const items = [item("this"), item("published", { status: "published" }), item("next"), item("last", { status: "approved" })];
    const { next, remaining } = nextToHandle(items, "this");
    expect(next?.id).toBe("next");
    expect(remaining).toBe(2);
    expect(nextToHandle([item("this")], "this")).toEqual({ next: null, remaining: 0 });
  });
});
