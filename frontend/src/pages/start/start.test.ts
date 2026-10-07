import { describe, expect, it } from "vitest";
import type { MatchView, NoticeSummary } from "../../api/types";
import { matchView, noticeSummary } from "../../test/fixtures";
import { firstName, isFitting, nextDeadlines, sortMatches, withoutEngineLead } from "./start";
import { agreementEndText, periodLines, periodText, sortUpcoming } from "./upcoming";

const NOW = new Date("2026-10-05T10:00:00+02:00");

function match(id: string, fit: MatchView["fit"], notice: Partial<NoticeSummary>): MatchView {
  return { ...matchView, id, fit, notice: { ...noticeSummary, id: `notice-${id}`, ...notice } };
}

describe("firstName", () => {
  it("greets by the first name", () => {
    expect(firstName("Anna Berg")).toBe("Anna");
    expect(firstName("  Lars  Holm ")).toBe("Lars");
  });
});

describe("withoutEngineLead", () => {
  it("drops the lead-in older assessments were stored with, and nothing else", () => {
    expect(withoutEngineLead("Automatisk sammanställning utan språkmodell: Upphandlingen verkar passa er.")).toBe(
      "Upphandlingen verkar passa er.",
    );
    expect(withoutEngineLead("Upphandlingen passar er delvis.")).toBe("Upphandlingen passar er delvis.");
  });
});

describe("sortMatches and isFitting", () => {
  it("puts the best fit first, then the nearest deadline, and notices without one last", () => {
    const sorted = sortMatches([
      match("a", "passar_delvis", { deadline_at: "2026-10-20T23:59:00+02:00" }),
      match("b", "passar", { deadline_at: null }),
      match("c", "passar", { deadline_at: "2026-11-09T23:59:00+01:00" }),
      match("d", "passar_inte", { deadline_at: "2026-10-06T23:59:00+02:00" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a", "d"]);
    expect(sorted.filter(isFitting).map((item) => item.id)).toEqual(["c", "b", "a"]);
  });
});

describe("nextDeadlines", () => {
  it("takes the nearest deadline among the matches that fit, and the same notice's next one after it", () => {
    const solbacken = match("s", "passar", {
      question_deadline: "2026-10-30T23:59:59+01:00",
      deadline_at: "2026-11-09T23:59:00+01:00",
    });
    const hedbergska = match("h", "passar_delvis", { question_deadline: null, deadline_at: "2026-10-30T23:59:00+01:00" });
    const unfit = match("u", "passar_inte", { question_deadline: null, deadline_at: "2026-10-10T23:59:00+02:00" });

    const result = nextDeadlines([hedbergska, unfit, solbacken], NOW);
    // Same day: the better fit leads, although Hedbergska's moment is a minute earlier.
    expect(result?.next).toMatchObject({ kind: "fragestopp", at: "2026-10-30T23:59:59+01:00" });
    expect(result?.next.notice.id).toBe("notice-s");
    expect(result?.then).toMatchObject({ kind: "sista_anbudsdag", at: "2026-11-09T23:59:00+01:00" });
  });

  it("skips what has passed and gives nothing when no deadline is left", () => {
    const passedQuestions = match("p", "passar", {
      question_deadline: "2026-10-01T23:59:59+02:00",
      deadline_at: "2026-10-20T23:59:00+02:00",
    });
    const result = nextDeadlines([passedQuestions], NOW);
    expect(result?.next.kind).toBe("sista_anbudsdag");
    expect(result?.then).toBeNull();

    expect(nextDeadlines([match("x", "passar", { question_deadline: null, deadline_at: null })], NOW)).toBeNull();
    expect(nextDeadlines([], NOW)).toBeNull();
  });

  it("calls a restricted procedure's deadline the last day for anbudsansökan", () => {
    const restricted = match("r", "passar", {
      question_deadline: null,
      deadline_at: "2026-10-30T23:59:59+01:00",
      deadline_kind: "request",
    });
    expect(nextDeadlines([restricted], NOW)?.next).toMatchObject({ kind: "anbudsansokan", at: "2026-10-30T23:59:59+01:00" });
  });
});

describe("upcoming procurements", () => {
  it("writes the expected period with short months", () => {
    expect(periodText("2027-02-28", "2027-05-30")).toBe("feb–maj 2027");
    expect(periodText("2026-11-30", "2027-02-28")).toBe("nov 2026–feb 2027");
    expect(periodText("2027-03-01", "2027-03-31")).toBe("mar 2027");
  });

  it("splits the period into the months and the year for a narrow column", () => {
    expect(periodLines("2027-02-28", "2027-05-30")).toEqual({ months: "feb–maj", years: "2027" });
    expect(periodLines("2026-11-30", "2027-02-28")).toEqual({ months: "nov–feb", years: "2026–2027" });
    expect(periodLines("2027-03-01", "2027-03-31")).toEqual({ months: "mar", years: "2027" });
  });

  it("says when the agreement ends and how long it can be extended", () => {
    expect(agreementEndText({ end_date: "2027-11-30", max_end_date: null })).toBe(
      "Nuvarande avtal löper ut 30 november 2027.",
    );
    expect(agreementEndText({ end_date: "2028-02-29", max_end_date: "2029-02-28" })).toBe(
      "Nuvarande avtal löper ut 29 februari 2028 och kan förlängas till längst 28 februari 2029.",
    );
  });

  it("puts the soonest first, and the company's own first when asked", () => {
    const base = {
      category: null,
      cpv_codes: [],
      end_date: "2027-12-31",
      max_end_date: null,
      expected_to: "2027-06-30",
      previous_requirements: null,
      is_fictitious: true,
      announcement_overdue: false,
    };
    const items = [
      { ...base, agreement_id: "1", title: "Tryck", expected_from: "2027-01-31", relevant_for_company: false },
      { ...base, agreement_id: "2", title: "Måleri", expected_from: "2027-02-28", relevant_for_company: true },
    ];
    expect(sortUpcoming(items).map((item) => item.title)).toEqual(["Tryck", "Måleri"]);
    expect(sortUpcoming(items, true).map((item) => item.title)).toEqual(["Måleri", "Tryck"]);
  });
});
