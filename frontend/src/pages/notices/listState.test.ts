import { describe, expect, it } from "vitest";
import { rangeText, resultText } from "./listCopy";
import {
  applyChanges,
  CLEARED_FILTERS,
  currentSort,
  defaultSort,
  hasNarrowingFilters,
  parseListState,
  parseStatus,
  sortChoices,
  toBuyerFilters,
  toNoticeFilters,
} from "./listState";

describe("parseStatus", () => {
  it("lists open notices without a parameter, and keeps old links working", () => {
    expect(parseStatus(null)).toBe("open");
    expect(parseStatus("open")).toBe("open");
    expect(parseStatus("planned")).toBe("planned");
    expect(parseStatus("alla")).toBe("all");
    // The closed and awarded choices are part of Alla now.
    expect(parseStatus("closed")).toBe("all");
    expect(parseStatus("awarded")).toBe("all");
  });
});

describe("parseListState and applyChanges", () => {
  it("reads the address and ignores what it does not know", () => {
    expect(
      parseListState(
        new URLSearchParams("q=m%C3%A5lning&kalla=ted&kopare=Timr%C3%A5+kommun&passar=1&sortera=publicerad&sida=3"),
      ),
    ).toEqual({
      q: "målning",
      status: "open",
      source: "ted",
      buyer: "Timrå kommun",
      isFitOnly: true,
      sort: "published",
      page: 3,
    });
    expect(parseListState(new URLSearchParams("kalla=okand&kopare=%20&sortera=konstig&sida=-2"))).toMatchObject({
      source: null,
      buyer: null,
      sort: null,
      page: 1,
    });
  });

  it("starts again on page 1 when a filter changes, and writes Öppna as no parameter", () => {
    const current = new URLSearchParams("status=alla&sida=4&q=st%C3%A4d");
    const next = applyChanges(current, { status: "open" });
    expect(next.get("status")).toBeNull();
    expect(next.get("sida")).toBeNull();
    expect(next.get("q")).toBe("städ");

    expect(applyChanges(current, { page: 5 }).get("sida")).toBe("5");
    expect(applyChanges(current, { page: 1 }).get("sida")).toBeNull();
    expect(applyChanges(current, { q: "  " }).get("q")).toBeNull();
    expect(applyChanges(current, { isFitOnly: true, sort: "deadline" }).toString()).toContain("passar=1");
    expect(applyChanges(new URLSearchParams("passar=1&kalla=ted"), { isFitOnly: false, source: null }).toString()).toBe("");
  });

  it("puts the buyer in the address, starts again on page 1, and clears it with the other filters", () => {
    const withBuyer = applyChanges(new URLSearchParams("sida=3&status=alla"), { buyer: " Timrå kommun " });
    expect(withBuyer.get("kopare")).toBe("Timrå kommun");
    expect(withBuyer.get("sida")).toBeNull();
    expect(withBuyer.get("status")).toBe("alla");

    const current = new URLSearchParams("q=m%C3%A5lning&kalla=ted&kopare=Mitthem+AB&passar=1&status=alla");
    const cleared = applyChanges(current, CLEARED_FILTERS);
    expect(cleared.toString()).toBe("status=alla");
  });
});

describe("toNoticeFilters", () => {
  const state = parseListState(new URLSearchParams("passar=1&sida=2"));

  it("sends the profile's codes for the fit filter, and the page as an offset", () => {
    expect(toNoticeFilters(state, ["45442100", "45442110"])).toEqual({
      q: undefined,
      status: "open",
      source: undefined,
      cpv: "45442100,45442110",
      buyer: undefined,
      sort: undefined,
      limit: 20,
      offset: 20,
    });
  });

  it("sends the buyer, and counts the buyer choices with every filter but the buyer, the order and the page", () => {
    const address = "q=st%C3%A4d&kalla=ted&kopare=Timr%C3%A5+kommun&passar=1&sortera=publicerad&sida=2";
    const filters = toNoticeFilters(parseListState(new URLSearchParams(address)), ["90910000"]);
    expect(filters.buyer).toBe("Timrå kommun");
    expect(toBuyerFilters(filters)).toEqual({ q: "städ", status: "open", source: "ted", cpv: "90910000" });
  });

  it("filters nothing on fit without codes, and asks for every status for Alla", () => {
    expect(toNoticeFilters(state, []).cpv).toBeUndefined();
    expect(toNoticeFilters({ ...state, status: "all" }, null).status).toBeUndefined();
  });
});

describe("hasNarrowingFilters", () => {
  it("counts a buyer as a filter, but not the status or the order", () => {
    const plain = parseListState(new URLSearchParams("status=alla&sortera=publicerad"));
    expect(hasNarrowingFilters(plain)).toBe(false);
    expect(hasNarrowingFilters({ ...plain, buyer: "Mitthem AB" })).toBe(true);
  });
});

describe("defaultSort, currentSort and sortChoices", () => {
  it("mirrors the backend: open by deadline, otherwise newest or best match", () => {
    expect(defaultSort("open", "målning")).toBe("deadline");
    expect(defaultSort("all", "")).toBe("published");
    expect(defaultSort("planned", "målning")).toBe("relevance");
  });

  it("follows the order the backend says it used, then the reader's choice, then the default", () => {
    const state = parseListState(new URLSearchParams("status=alla&sortera=frist"));
    expect(currentSort(state, { sort: "published" })).toBe("published");
    expect(currentSort(state, undefined)).toBe("deadline");
    expect(currentSort({ ...state, sort: null }, undefined)).toBe("published");
  });

  it("offers Bäst träff only with a search text", () => {
    expect(sortChoices("").map((choice) => choice.label)).toEqual(["Sista anbudsdag", "Senast publicerad"]);
    expect(sortChoices("fönster").map((choice) => choice.label)).toEqual([
      "Sista anbudsdag",
      "Senast publicerad",
      "Bäst träff",
    ]);
  });
});

describe("resultText", () => {
  it("says how many, what narrows the list and in what order", () => {
    expect(resultText({ total: 12, status: "open", q: "", isFitOnly: false, sort: "deadline" })).toBe(
      "12 öppna upphandlingar · närmast sista anbudsdag först",
    );
    expect(resultText({ total: 2, status: "open", q: "", isFitOnly: true, sort: "deadline" })).toBe(
      "2 öppna upphandlingar verkar passa er · närmast sista anbudsdag först",
    );
    expect(resultText({ total: 3, status: "all", q: "fasad", isFitOnly: true, sort: "relevance" })).toBe(
      "3 upphandlingar verkar passa er och matchar ”fasad” · bäst träff först",
    );
    expect(resultText({ total: 1, status: "planned", q: "", isFitOnly: false, sort: "published" })).toBe(
      "1 planerad upphandling",
    );
    expect(resultText({ total: 1200, status: "all", q: "", isFitOnly: false, sort: "published" })).toBe(
      "1\u00a0200 upphandlingar · senast publicerade först",
    );
  });

  it("names the chosen buyer", () => {
    const base = { q: "", isFitOnly: false } as const;
    expect(resultText({ ...base, total: 3, status: "open", buyer: "Timrå kommun", sort: "deadline" })).toBe(
      "3 öppna upphandlingar från Timrå kommun · närmast sista anbudsdag först",
    );
    expect(resultText({ total: 1, status: "all", q: "fönster", buyer: "Mitthem AB", isFitOnly: true, sort: "relevance" }))
      .toBe("1 upphandling från Mitthem AB verkar passa er och matchar ”fönster”");
  });

  it("says which rows a page shows", () => {
    expect(rangeText(1, 20, 168)).toBe("Visar 1–20 av 168");
    expect(rangeText(9, 20, 168)).toBe("Visar 161–168 av 168");
  });
});
