import { describe, expect, it } from "vitest";
import type { MatchView, ReminderView } from "../../api/types";
import { matchView, noticeSummary, reminder } from "../../test/fixtures";
import { deadlineSuggestions, mailTime, sendState, splitReminders } from "./reminderFacts";

const NOW = new Date("2026-10-05T10:00:00+02:00");

function reminderWith(changes: Partial<ReminderView>): ReminderView {
  return { ...reminder, ...changes };
}

describe("mailTime", () => {
  it("says when the e-mail goes, with the weekday, in Swedish time", () => {
    expect(mailTime("2026-10-14T08:00:00+02:00", NOW)).toBe("onsdag 14 oktober kl. 08:00");
    expect(mailTime("2026-11-07T07:00:00Z", NOW)).toBe("lördag 7 november kl. 08:00");
    expect(mailTime("2027-01-12T08:00:00+01:00", NOW)).toBe("tisdag 12 januari 2027 kl. 08:00");
  });
});

describe("sendState", () => {
  it("counts down to the e-mail instead of saying that it waits", () => {
    // Shown under "Mejlas" and the time: "Mejlas onsdag 14 oktober kl. 08:00 · om 9 dagar".
    expect(sendState(reminderWith({ due_at: "2026-10-14T08:00:00+02:00" }), NOW)).toEqual({
      label: "om 9 dagar",
      isSent: false,
    });
    expect(sendState(reminderWith({ due_at: "2026-10-06T08:00:00+02:00" }), NOW).label).toBe("i morgon");
    expect(sendState(reminderWith({ due_at: "2026-10-05T08:00:00+02:00" }), NOW).label).toBe("inom kort");
  });

  it("says when a sent reminder went", () => {
    expect(sendState(reminderWith({ sent_at: "2026-10-01T08:02:00+02:00" }), NOW)).toEqual({
      label: "Skickad 1 okt",
      isSent: true,
    });
  });
});

describe("splitReminders", () => {
  it("lists coming reminders in the order they are sent and sent ones newest first", () => {
    const later = reminderWith({ id: "b", due_at: "2026-11-07T08:00:00+01:00" });
    const sooner = reminderWith({ id: "a", due_at: "2026-10-14T08:00:00+02:00" });
    const oldSent = reminderWith({ id: "c", sent_at: "2026-09-01T08:00:00+02:00" });
    const newSent = reminderWith({ id: "d", sent_at: "2026-10-01T08:00:00+02:00" });
    const { upcoming, sent } = splitReminders([later, oldSent, sooner, newSent]);
    expect(upcoming.map((item) => item.id)).toEqual(["a", "b"]);
    expect(sent.map((item) => item.id)).toEqual(["d", "c"]);
  });
});

describe("deadlineSuggestions", () => {
  it("offers the nearest deadlines still ahead in the matches, frågestopp and sista anbudsdag alike", () => {
    const later: MatchView = {
      ...matchView,
      id: "later",
      notice: {
        ...noticeSummary,
        id: "n2",
        title: "Fasadmålning, Timrå",
        question_deadline: null,
        deadline_at: "2026-11-20T12:00:00+01:00",
      },
    };
    expect(deadlineSuggestions([later, matchView], NOW)).toEqual([
      {
        noticeId: noticeSummary.id,
        title: noticeSummary.title,
        kind: "fragestopp",
        deadline: "2026-10-16T23:59:59+02:00",
        date: "2026-10-16",
      },
      {
        noticeId: noticeSummary.id,
        title: noticeSummary.title,
        kind: "sista_anbudsdag",
        deadline: "2026-10-26T23:59:00+01:00",
        date: "2026-10-26",
      },
      { noticeId: "n2", title: "Fasadmålning, Timrå", kind: "sista_anbudsdag", deadline: "2026-11-20T12:00:00+01:00", date: "2026-11-20" },
    ]);
    expect(deadlineSuggestions([later, matchView], NOW, 1)).toHaveLength(1);
  });

  it("only suggests deadlines in matches that seem to fit", () => {
    const unfit: MatchView = { ...matchView, id: "unfit", fit: "passar_inte", notice: { ...noticeSummary, id: "n3" } };
    expect(deadlineSuggestions([unfit], NOW)).toEqual([]);
    expect(deadlineSuggestions([unfit, matchView], NOW).map((item) => item.noticeId)).toEqual([
      noticeSummary.id,
      noticeSummary.id,
    ]);
  });

  it("leaves out deadlines that have passed", () => {
    expect(deadlineSuggestions([matchView], new Date("2026-10-20T10:00:00+02:00")).map((item) => item.kind)).toEqual([
      "sista_anbudsdag",
    ]);
  });
});
