import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderView } from "../api/types";
import { companyUser, matchView, NOTICE_ID, reminder } from "../test/fixtures";
import { baseRoutes, mockApi, renderApp } from "../test/render";

/** Sista anbudsdag follows the notice's own deadline with its time; the e-mail goes two days before at 08:00. */
const tenderReminder: ReminderView = {
  ...reminder,
  id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
  kind: "sista_anbudsdag",
  due_at: "2026-11-07T08:00:00+01:00",
  deadline_at: "2026-11-09T23:59:00+01:00",
};

const sentReminder: ReminderView = {
  ...reminder,
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  notice_id: "3c2b1a0f-9e8d-4c7b-a6f5-e4d3c2b1a0f9",
  notice_title: "Fönsterrenovering, Kvissleby skola",
  due_at: "2026-10-01T08:00:00+02:00",
  deadline_at: "2026-10-03T23:59:59+02:00",
  sent_at: "2026-10-01T08:02:00+02:00",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RemindersPage", () => {
  it("shows the deadline and the e-mail as two facts, coming reminders before sent ones", async () => {
    mockApi([
      ...baseRoutes(companyUser),
      { method: "GET", path: "/api/reminders", body: [tenderReminder, sentReminder, reminder] },
      { method: "GET", path: "/api/matches", body: [] },
    ]);
    renderApp("/paminnelser");

    expect(await screen.findByRole("heading", { level: 1, name: "Påminnelser" })).toBeInTheDocument();
    const coming = await screen.findByRole("region", { name: "Kommande" });
    const [first, second] = within(coming).getAllByRole("listitem");

    expect(within(first!).getByRole("link", { name: reminder.notice_title })).toHaveAttribute("href", `/upphandlingar/${NOTICE_ID}`);
    expect(within(first!).getByText("Sista dag för frågor")).toBeInTheDocument();
    expect(within(first!).getByText("16 oktober 2026")).toBeInTheDocument();
    expect(within(first!).getByText("om 11 dagar")).toBeInTheDocument();
    expect(within(first!).getByText("Mejlas")).toBeInTheDocument();
    expect(within(first!).getByText("onsdag 14 oktober kl. 08:00")).toBeInTheDocument();
    expect(within(first!).getByText("om 9 dagar")).toBeInTheDocument();

    expect(within(second!).getByText("Sista anbudsdag")).toBeInTheDocument();
    expect(within(second!).getByText("9 november 2026 kl. 23:59")).toBeInTheDocument();
    expect(within(second!).getByText("lördag 7 november kl. 08:00")).toBeInTheDocument();
    expect(within(second!).getByText("om 33 dagar")).toBeInTheDocument();
    // The deadline's kind is said once, as the deadline's label, never beside the e-mail's time.
    expect(within(second!).getAllByText(/Sista anbudsdag/)).toHaveLength(1);

    const sent = screen.getByRole("region", { name: "Skickade" });
    expect(within(sent).getByRole("link", { name: sentReminder.notice_title })).toBeInTheDocument();
    expect(within(sent).getByText("Skickad 1 okt")).toBeInTheDocument();
    expect(screen.getByText(/Påminnelserna mejlas till anna@example\.invalid\./)).toBeInTheDocument();
  });

  it("removes a reminder after a confirmation and leaves the focus on its section", async () => {
    let reminders = [reminder, tenderReminder];
    const calls = mockApi([
      ...baseRoutes(companyUser),
      { method: "GET", path: "/api/reminders", body: () => reminders },
      { method: "GET", path: "/api/matches", body: [] },
      {
        method: "DELETE",
        path: `/api/reminders/${tenderReminder.id}`,
        status: 204,
        body: () => {
          reminders = [reminder];
        },
      },
    ]);
    renderApp("/paminnelser");

    await userEvent.click(
      await screen.findByRole("button", { name: `Ta bort påminnelsen om sista anbudsdag för ${reminder.notice_title}` }),
    );
    const dialog = screen.getByRole("alertdialog", { name: "Ta bort påminnelsen?" });
    expect(within(dialog).getByText(`Du får inget mejl om sista anbudsdag för ${reminder.notice_title}.`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ta bort" }));

    expect(await screen.findByText(`Påminnelsen om sista anbudsdag för ${reminder.notice_title} är borttagen.`)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
    const coming = screen.getByRole("region", { name: "Kommande" });
    expect(within(coming).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Kommande" })).toHaveFocus();
  });

  it("suggests the nearest deadlines in the matches when there is no reminder yet", async () => {
    let reminders: ReminderView[] = [];
    const calls = mockApi([
      ...baseRoutes(companyUser),
      { method: "GET", path: "/api/reminders", body: () => reminders },
      { method: "GET", path: "/api/matches", body: [matchView] },
      {
        method: "POST",
        path: `/api/notices/${NOTICE_ID}/reminders`,
        body: () => {
          reminders = [reminder];
          return reminder;
        },
      },
    ]);
    renderApp("/paminnelser");

    // The suggestions are the empty state itself.
    const suggestions = await screen.findByRole("region", { name: "Inga påminnelser ännu" });
    expect(within(suggestions).getByText(/Här är de närmaste fristerna i upphandlingar som verkar passa er\./)).toBeInTheDocument();
    const rows = within(suggestions).getByRole("list", { name: "Frister i dina träffar" });
    expect(within(rows).getByRole("button", { name: "Påminn mig före sista anbudsdag 26 oktober 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Se upphandlingar" })).not.toBeInTheDocument();
    await userEvent.click(within(rows).getByRole("button", { name: "Påminn mig före sista dag för frågor 16 oktober 2026" }));

    expect(await screen.findByRole("region", { name: "Kommande" })).toBeInTheDocument();
    expect(within(rows).getByText("Påminnelse mejlas 14 okt")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Frister i dina träffar" })).toBe(suggestions);
    expect(screen.queryByRole("heading", { name: "Inga påminnelser ännu" })).not.toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ kind: "fragestopp" });
  });

  it("leads to the notices when there is no reminder and no deadline to suggest", async () => {
    mockApi([
      ...baseRoutes(companyUser),
      { method: "GET", path: "/api/reminders", body: [] },
      { method: "GET", path: "/api/matches", body: [{ ...matchView, fit: "passar_inte" }] },
    ]);
    renderApp("/paminnelser");

    expect(await screen.findByRole("heading", { level: 2, name: "Inga påminnelser ännu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Se upphandlingar" })).toHaveAttribute("href", "/upphandlingar");
    expect(screen.queryByRole("list", { name: "Frister i dina träffar" })).not.toBeInTheDocument();
  });
});
