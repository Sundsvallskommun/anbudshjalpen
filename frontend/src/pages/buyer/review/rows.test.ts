import { describe, expect, it } from "vitest";
import type { Checklist } from "../../../api/types";
import { draftChecklistView } from "../../../test/fixtures";
import {
  checklistRows,
  groupedRows,
  newItem,
  nextRequirementId,
  withItem,
  withItemInserted,
  withoutItem,
} from "./rows";

const checklist: Checklist = draftChecklistView.checklist;

describe("checklistRows", () => {
  it("makes every part companies see a row, with a key that names it", () => {
    const rows = checklistRows(checklist);
    expect(rows.map((row) => row.key)).toEqual([
      "krav:K1",
      "krav:K2",
      "datum:fragestopp:2026-10-16:Frågor ställs i e-Avrop.",
      "bilaga:Prisbilaga",
      "utvardering:Pris",
      "begrepp:försäkringsbevis",
    ]);
    expect(rows[4]?.title).toBe("Pris 70 %");
    expect(rows[5]?.citation).toBeNull();
  });

  it("tells identical items apart", () => {
    const date = checklist.dates[0]!;
    const rows = checklistRows({ ...checklist, dates: [date, date] }).filter((row) => row.item.section === "date");
    expect(rows.map((row) => row.key)).toEqual([
      "datum:fragestopp:2026-10-16:Frågor ställs i e-Avrop.",
      "datum:fragestopp:2026-10-16:Frågor ställs i e-Avrop.#2",
    ]);
  });

  it("keeps a row's key when another row is removed", () => {
    const before = checklistRows(checklist).find((row) => row.item.section === "attachment")!.key;
    const after = checklistRows(withoutItem(checklist, "requirement", 0)).find((row) => row.item.section === "attachment")!.key;
    expect(after).toBe(before);
  });

  it("shows a requirement's whole first sentence when its title was cut off", () => {
    const requirement = {
      ...checklist.requirements[0]!,
      title: "Leverantören ska ha en ansvarsförsäkring om …",
      plain_language: "Leverantören ska ha en ansvarsförsäkring om minst 5 miljoner kronor. Visa ett bevis.",
    };
    const [row] = checklistRows({ ...checklist, requirements: [requirement] });
    expect(row?.title).toBe("Leverantören ska ha en ansvarsförsäkring om minst 5 miljoner kronor.");
  });
});

describe("groupedRows", () => {
  it("groups by kind of requirement first, then the other parts, leaving out empty groups", () => {
    const groups = groupedRows(checklistRows(checklist)).map(({ group, rows }) => [group.title, rows.length]);
    expect(groups).toEqual([
      ["Skallkrav", 1],
      ["Kvalificeringskrav", 1],
      ["Viktiga datum", 1],
      ["Bilagor att lämna in", 1],
      ["Så utvärderas anbuden", 1],
      ["Ord och begrepp", 1],
    ]);
  });
});

describe("editing the checklist", () => {
  it("replaces an item in place, or adds a new one at the end of its list", () => {
    const renamed = { ...checklist.requirements[1]!, title: "Tre referensuppdrag" };
    expect(withItem(checklist, { section: "requirement", value: renamed }, 1).requirements[1]?.title).toBe(
      "Tre referensuppdrag",
    );
    const added = withItem(checklist, { section: "question", value: "Gäller avtalet även kök?" }, null);
    expect(added.open_questions).toEqual(["Gäller avtalet även kök?"]);
  });

  it("puts a removed item back where it was", () => {
    const removed = withoutItem(checklist, "requirement", 0);
    expect(removed.requirements.map((item) => item.id)).toEqual(["K2"]);
    const restored = withItemInserted(removed, { section: "requirement", value: checklist.requirements[0]! }, 0);
    expect(restored.requirements.map((item) => item.id)).toEqual(["K1", "K2"]);
  });

  it("numbers a new requirement after the existing ones and starts it on the page being read", () => {
    expect(nextRequirementId(checklist.requirements)).toBe("K3");
    expect(nextRequirementId([{ ...checklist.requirements[0]!, id: "K2" }])).toBe("K3");
    const item = newItem(checklist, "requirement", 7);
    expect(item.section === "requirement" && item.value.id).toBe("K3");
    expect(item.section === "requirement" && item.value.citation.page).toBe(7);
  });
});
