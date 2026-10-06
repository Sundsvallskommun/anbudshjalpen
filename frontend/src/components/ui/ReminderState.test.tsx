import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_QUERY } from "../../lib/usePhone";
import { buyerUser, companyUser, NOTICE_ID, reminder, session } from "../../test/fixtures";
import { mockApi, type MockRoute } from "../../test/render";
import { reminderConfirmation, ReminderState } from "./ReminderState";
import { renderWithProviders } from "./testing";

function sessionRoute(user: typeof companyUser | null): MockRoute {
  return { method: "GET", path: "/api/session", body: session(user) };
}

const props = { noticeId: NOTICE_ID, kind: "fragestopp" as const, deadline: "2026-10-16", subject: "frågestoppet" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReminderState", () => {
  it("creates the reminder and then shows when it is mailed, keeping the user's place", async () => {
    const calls = mockApi([
      sessionRoute(companyUser),
      { method: "GET", path: "/api/reminders", body: [] },
      { method: "POST", path: `/api/notices/${NOTICE_ID}/reminders`, body: reminder },
    ]);
    renderWithProviders(<ReminderState {...props} />);

    await userEvent.click(await screen.findByRole("button", { name: "Påminn mig före frågestoppet 16 oktober 2026" }));
    expect(await screen.findByText("Påminnelse mejlas 14 okt")).toBeInTheDocument();
    const change = screen.getByRole("link", { name: "Ändra påminnelsen om frågestoppet" });
    expect(change).toHaveAttribute("href", "/paminnelser");
    expect(change).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Klart! Du får ett mejl 14 oktober kl. 08:00, två dagar före frågestoppet.",
    );
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ kind: "fragestopp" });
  });

  it("shows a reminder the company already has, from its reminders", async () => {
    mockApi([sessionRoute(companyUser), { method: "GET", path: "/api/reminders", body: [reminder] }]);
    renderWithProviders(<ReminderState {...props} />);
    expect(await screen.findByText("Påminnelse mejlas 14 okt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Påminn mig/ })).not.toBeInTheDocument();
  });

  it("takes a visitor to the login and back", async () => {
    mockApi([sessionRoute(null)]);
    renderWithProviders(<ReminderState {...props} />, { path: `/upphandlingar/${NOTICE_ID}?flik=fraga` });
    expect(await screen.findByRole("link", { name: /Påminn mig före frågestoppet 16 oktober 2026, logga in först/ })).toHaveAttribute(
      "href",
      `/logga-in?till=${encodeURIComponent(`/upphandlingar/${NOTICE_ID}?flik=fraga`)}`,
    );
  });

  it("offers nothing to inköp or for a passed deadline", async () => {
    mockApi([sessionRoute(buyerUser)]);
    renderWithProviders(<ReminderState {...props} />);
    await screen.findByTestId("location");
    expect(screen.queryByRole("button", { name: /Påminn mig/ })).not.toBeInTheDocument();

    mockApi([sessionRoute(companyUser), { method: "GET", path: "/api/reminders", body: [] }]);
    renderWithProviders(<ReminderState {...props} deadline="2026-10-01" />);
    await screen.findAllByTestId("location");
    expect(screen.queryByRole("button", { name: /Påminn mig/ })).not.toBeInTheDocument();
  });

  it("words the confirmation from the reminder's own time and the deadline", () => {
    expect(reminderConfirmation({ due_at: "2026-11-07T08:00:00+01:00" }, "2026-11-09", "sista anbudsdag")).toBe(
      "Klart! Du får ett mejl 7 november kl. 08:00, två dagar före sista anbudsdag.",
    );
  });

  it("counts the gap from the deadline the backend follows, also for a reminder made late", () => {
    // Made the day before: the mail goes at once, so due_at is "now".
    expect(
      reminderConfirmation(
        { due_at: "2026-11-08T14:23:00+01:00", deadline_at: "2026-11-09T23:59:00+01:00" },
        "2026-11-09",
        "sista anbudsdag",
      ),
    ).toBe("Klart! Du får ett mejl 8 november kl. 14:23, en dag före sista anbudsdag.");
    // The backend's deadline wins over the date the button showed.
    expect(
      reminderConfirmation({ due_at: reminder.due_at, deadline_at: reminder.deadline_at }, "2026-10-17", "frågestoppet"),
    ).toBe("Klart! Du får ett mejl 14 oktober kl. 08:00, två dagar före frågestoppet.");
  });

  it("says a shorter fact on a phone, and the whole of it to screen readers", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === PHONE_QUERY,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    mockApi([sessionRoute(companyUser), { method: "GET", path: "/api/reminders", body: [reminder] }]);
    renderWithProviders(<ReminderState {...props} />);
    const fact = await screen.findByText("Påminnelse 14 okt");
    expect(fact).toHaveTextContent("Påminnelse mejlas 14 okt");
    expect(screen.getByRole("link", { name: "Ändra påminnelsen om frågestoppet" })).toBeInTheDocument();
  });
});
