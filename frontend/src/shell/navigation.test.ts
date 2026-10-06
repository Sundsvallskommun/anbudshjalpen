import { describe, expect, it } from "vitest";
import { backLink, homePath, initials, isNavSelected, mainNav, toReviewCount } from "./navigation";

describe("navigation", () => {
  it("gives each role its three main choices, and a visitor two", () => {
    expect(mainNav("foretagare").map((entry) => entry.label)).toEqual(["Start", "Upphandlingar", "Regelhjälpen"]);
    expect(mainNav("inkopare").map((entry) => entry.label)).toEqual(["Inköp", "Upphandlingar", "Regelhjälpen"]);
    expect(mainNav(null).map((entry) => entry.label)).toEqual(["Upphandlingar", "Regelhjälpen"]);
  });

  it("chooses the section of a page and of the pages below it", () => {
    const [start, notices] = mainNav("foretagare");
    expect(isNavSelected(notices!, "/upphandlingar")).toBe(true);
    expect(isNavSelected(notices!, "/upphandlingar/abc")).toBe(true);
    expect(isNavSelected(notices!, "/upphandlingarna")).toBe(false);
    expect(isNavSelected(start!, "/upphandlingar")).toBe(false);
    expect(isNavSelected(mainNav("inkopare")[0]!, "/inkop/checklistor/1")).toBe(true);
  });

  it("starts a company on Start, inköp in Inköp and a visitor among the notices", () => {
    expect(homePath("foretagare")).toBe("/start");
    expect(homePath("inkopare")).toBe("/inkop");
    expect(homePath(null)).toBe("/upphandlingar");
  });

  it("gives a detail page a back link and a top-level page none", () => {
    expect(backLink("/upphandlingar/abc", null)).toEqual({ label: "Upphandlingar", href: "/upphandlingar" });
    expect(backLink("/inkop/checklistor/1", "inkopare")).toEqual({ label: "Inköp", href: "/inkop" });
    expect(backLink("/inkop/drift", "inkopare")).toEqual({ label: "Inköp", href: "/inkop" });
    expect(backLink("/profil", "foretagare")).toEqual({ label: "Start", href: "/start" });
    expect(backLink("/upphandlingar", "foretagare")).toBeNull();
    expect(backLink("/start", "foretagare")).toBeNull();
    expect(backLink("/inkop", "inkopare")).toBeNull();
  });

  it("counts the checklists inköp has to act on", () => {
    expect(toReviewCount([{ status: "draft" }, { status: "approved" }, { status: "published" }, { status: "rejected" }])).toBe(2);
    expect(toReviewCount([])).toBe(0);
  });

  it("makes the avatar's initials from the first and last name", () => {
    expect(initials("Anna Berg")).toBe("AB");
    expect(initials("Lars Erik Holm")).toBe("LH");
    expect(initials("Inköp")).toBe("I");
  });
});
