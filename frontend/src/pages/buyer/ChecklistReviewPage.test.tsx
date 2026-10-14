import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistAdminItem, ChecklistUpdate, ChecklistView, PageView, RejectRequest } from "../../api/types";
import {
  buyerUser,
  CHECKLIST_ID,
  checklistAdminItem,
  checklistView,
  DOCUMENT_ID,
  draftChecklistView,
  NOTICE_ID,
  noticeDetail,
  rejectedChecklistView,
} from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute, type RecordedCall } from "../../test/render";

const BASE = `/api/admin/checklists/${CHECKLIST_ID}`;
const nextItem: ChecklistAdminItem = {
  ...checklistAdminItem,
  id: "f7d4b0a5-6e9a-4fb1-8c3d-4e5f6a7b8c93",
  notice_title: "Snöröjning i Kvissleby",
};

function page(number: number, text: string): MockRoute {
  const body: PageView = { document_id: DOCUMENT_ID, page_no: number, page_count: 16, text };
  return { method: "GET", path: `/api/notices/${NOTICE_ID}/documents/${DOCUMENT_ID}/pages/${number}`, body };
}

function routes(view: ChecklistView, extra: MockRoute[] = []): MockRoute[] {
  return [
    ...baseRoutes(buyerUser),
    { method: "GET", path: BASE, body: view },
    { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail },
    { method: "GET", path: "/api/admin/checklists", body: [{ ...checklistAdminItem, status: view.status }, nextItem] },
    ...extra,
  ];
}

/** A PUT that answers with the saved checklist, as the backend does (status back to draft). */
function saving(view: ChecklistView): MockRoute {
  return {
    method: "PUT",
    path: BASE,
    body: (update: unknown) => ({
      ...view,
      status: "draft",
      checklist: (update as ChecklistUpdate).checklist,
      reviewer_note: (update as ChecklistUpdate).reviewer_note,
    }),
  };
}

function writes(calls: RecordedCall[]) {
  return calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path.replace(BASE, "")}`);
}

const open = () => renderApp(`/inkop/checklistor/${CHECKLIST_ID}`);

/** A toast: its text is shown and also announced in the design system's live region. */
async function toast(text: string | RegExp) {
  expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
}

/**
 * A control in a toast. The toast viewport is a popover in the top layer, which jsdom never shows, so its controls
 * are only found among hidden elements here.
 */
function toastControl(role: "button" | "link", name: string) {
  return screen.getByRole(role, { name, hidden: true });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("ChecklistReviewPage: header", () => {
  it("names the notice, shows where the checklist stands and the facts to check it against", async () => {
    mockApi(routes(draftChecklistView));
    open();

    // The file's first render loads the page cold, which took 3.5 s on CI's runner (2026-10-13).
    expect(
      await screen.findByRole("heading", { level: 1, name: noticeDetail.title }, { timeout: 6000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Granska checklista")).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Checklistans status" });
    expect(within(steps).getByText("Utkast").closest('[aria-current="step"]')).not.toBeNull();
    expect(screen.getByText("16 sidor")).toBeInTheDocument();
    expect(screen.getByText("3 av 4 hittade")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visa upphandlingen som företagen ser den" })).toHaveAttribute(
      "href",
      `/upphandlingar/${NOTICE_ID}`,
    );
  });
});

describe("ChecklistReviewPage: decisions", () => {
  it("approves and publishes a draft after the confirmation, with the note, and offers the next one", async () => {
    const calls = mockApi([
      ...routes(draftChecklistView),
      saving(draftChecklistView),
      { method: "POST", path: `${BASE}/approve`, body: { ...draftChecklistView, status: "approved" } },
      {
        method: "POST",
        path: `${BASE}/publish`,
        body: { ...draftChecklistView, status: "published", published_at: "2026-10-05T12:00:00+02:00" },
      },
    ]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Godkänn och publicera" }));
    const dialog = await screen.findByRole("dialog", { name: "Godkänn och publicera checklistan" });
    expect(
      within(dialog).getByText(
        "Företagens påminnelser följer datumen i checklistan: sista dag för frågor 16 oktober 2026. De mejlas två dagar före, kl. 08:00.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("6 rader är inte markerade som kontrollerade.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Anteckning från granskningen/ }), "Kontrollerad mot underlaget.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Godkänn och publicera" }));

    await toast("Checklistan är publicerad.");
    expect(writes(calls)).toEqual(["PUT ", "POST /approve", "POST /publish"]);
    expect((calls.find((call) => call.method === "PUT")?.body as ChecklistUpdate).reviewer_note).toBe(
      "Kontrollerad mot underlaget.",
    );
    expect(toastControl("link", "Granska nästa (1 kvar)")).toHaveAttribute(
      "href",
      `/inkop/checklistor/${nextItem.id}`,
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Godkänn och publicera checklistan" })).not.toBeInTheDocument());
  });

  it("only publishes a checklist that is already approved", async () => {
    const approved: ChecklistView = { ...draftChecklistView, status: "approved", approved_at: "2026-10-04T10:00:00+02:00" };
    const calls = mockApi([
      ...routes(approved),
      { method: "POST", path: `${BASE}/publish`, body: { ...approved, status: "published", published_at: "2026-10-05T12:00:00+02:00" } },
    ]);
    open();

    expect(await screen.findByText(/Godkänd 4 okt 2026 kl\. 10:00, inte publicerad/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Godkänn och publicera" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publicera" }));
    const dialog = await screen.findByRole("dialog", { name: "Publicera checklistan" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Publicera" }));

    await toast("Checklistan är publicerad.");
    expect(writes(calls)).toEqual(["POST /publish"]);
  });

  it("approves without publishing from Fler val", async () => {
    const calls = mockApi([
      ...routes(draftChecklistView),
      { method: "POST", path: `${BASE}/approve`, body: { ...draftChecklistView, status: "approved" } },
    ]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Fler val" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Godkänn utan att publicera" }));

    await toast("Checklistan är godkänd. Företagen ser den när du publicerar den.");
    expect(writes(calls)).toEqual(["POST /approve"]);
    expect(await screen.findByRole("button", { name: "Publicera" })).toBeInTheDocument();
  });

  it("rejects with a reason that is checked when sent", async () => {
    const calls = mockApi([
      ...routes(draftChecklistView),
      {
        method: "POST",
        path: `${BASE}/reject`,
        body: (request: unknown) => ({ ...draftChecklistView, status: "rejected", reviewer_note: (request as RejectRequest).note }),
      },
    ]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Avvisa…" }));
    const dialog = await screen.findByRole("dialog", { name: "Avvisa checklistan" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Avvisa" }));
    expect(await within(dialog).findByText(/Skriv en motivering på minst tre tecken/)).toBeInTheDocument();
    expect(writes(calls)).toEqual([]);

    await userEvent.type(within(dialog).getByRole("textbox", { name: /Motivering/ }), "Fel frågestopp.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Avvisa" }));

    await toast("Checklistan är avvisad.");
    expect((calls.find((call) => call.path.endsWith("/reject"))?.body as RejectRequest).note).toBe("Fel frågestopp.");
  });

  it("shows why a checklist was rejected and opens it as a draft again; it is never approved as it is", async () => {
    const calls = mockApi([
      ...routes(rejectedChecklistView),
      { method: "POST", path: `${BASE}/reopen`, body: { ...rejectedChecklistView, status: "draft" } },
    ]);
    open();

    expect(await screen.findByText(rejectedChecklistView.reviewer_note!)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Godkänn och publicera" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Kontrollerad/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Öppna som utkast igen" }));

    expect(await screen.findByRole("button", { name: "Godkänn och publicera" })).toBeInTheDocument();
    expect(writes(calls)).toEqual(["POST /reopen"]);
    // The reason stays in view while the draft is corrected.
    expect(screen.getByText("Anteckning från granskningen")).toBeInTheDocument();
  });

  it("withdraws a published checklist with a reason", async () => {
    const calls = mockApi([
      ...routes(checklistView),
      {
        method: "POST",
        path: `${BASE}/withdraw`,
        body: (request: unknown) => ({ ...checklistView, status: "rejected", reviewer_note: (request as RejectRequest).note }),
      },
    ]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Dra tillbaka…" }));
    const dialog = await screen.findByRole("dialog", { name: "Dra tillbaka checklistan" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Motivering/ }), "Fel sista anbudsdag.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Dra tillbaka" }));

    await toast("Checklistan är tillbakadragen. Företagen ser den inte längre.");
    expect(writes(calls)).toEqual(["POST /withdraw"]);
    expect(screen.getAllByText("Tillbakadragen").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Öppna som utkast igen" })).toBeInTheDocument();
  });

  it("asks for a new interpretation of the same document", async () => {
    const calls = mockApi([
      ...routes(draftChecklistView),
      {
        method: "POST",
        path: `/api/admin/documents/${DOCUMENT_ID}/interpret`,
        status: 202,
        body: {
          document_id: DOCUMENT_ID,
          notice_id: NOTICE_ID,
          notice_title: noticeDetail.title,
          filename: "Förfrågningsunderlag Solbacken.pdf",
          state: "pending",
          attempts: 0,
          error: null,
          retry_at: null,
          created_at: "2026-10-05T08:00:00Z",
        },
      },
    ]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Fler val" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Tolka underlaget igen" }));

    await toast(/Underlaget tolkas igen/);
    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/interpret"))).toBe(true);
  });
});

describe("ChecklistReviewPage: editing", () => {
  it("edits a requirement and saves it at once, so the citation check answers", async () => {
    const calls = mockApi([...routes(draftChecklistView), saving(draftChecklistView)]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Fler val: Två referensuppdrag" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ändra" }));
    const dialog = await screen.findByRole("dialog", { name: "Ändra kravet" });
    const title = within(dialog).getByRole("textbox", { name: /^Kravet/ });
    await userEvent.clear(title);
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara kravet" }));
    expect(await within(dialog).findByText("Skriv kravet.")).toBeInTheDocument();

    await userEvent.type(title, "Tre referensuppdrag");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara kravet" }));

    expect(await screen.findByText("Alla ändringar sparade")).toBeInTheDocument();
    const saved = calls.find((call) => call.method === "PUT")?.body as ChecklistUpdate;
    expect(saved.checklist.requirements[1]?.title).toBe("Tre referensuppdrag");
    expect(saved.reviewer_note).toBeNull();
    expect(await screen.findByText("Tre referensuppdrag")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ändrade (1)" })).toBeInTheDocument();
  });

  it("removes a row and puts it back with Ångra", async () => {
    const calls = mockApi([...routes(draftChecklistView), saving(draftChecklistView)]);
    open();

    await userEvent.click(await screen.findByRole("button", { name: "Fler val: Prisbilaga" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ta bort" }));

    await toast("Bilagan är borttagen");
    await waitFor(() => expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1));
    expect((calls.find((call) => call.method === "PUT")?.body as ChecklistUpdate).checklist.attachments).toEqual([]);
    expect(screen.queryByText("Prisbilaga")).not.toBeInTheDocument();

    await userEvent.click(toastControl("button", "Ångra"));
    expect(await screen.findByText("Prisbilaga")).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((call) => call.method === "PUT")).toHaveLength(2));
    expect((calls.filter((call) => call.method === "PUT")[1]?.body as ChecklistUpdate).checklist.attachments).toHaveLength(1);
  });

  it("runs the automatic checks and opens the form a check points at", async () => {
    mockApi(routes({ ...draftChecklistView, checklist: { ...draftChecklistView.checklist, evaluation: [] } }));
    open();

    const checks = await screen.findByRole("list", { name: "Automatiska kontroller" });
    expect(await within(checks).findByText(/Checklistan saknar sista anbudsdag\. Annonsen anger 26 oktober 2026\./)).toBeInTheDocument();
    expect(within(checks).getByText(/2 källhänvisningar behöver kontrolleras/)).toBeInTheDocument();

    await userEvent.click(within(checks).getByRole("button", { name: "Lägg till utvärderingskriterier" }));
    expect(await screen.findByRole("dialog", { name: "Nytt utvärderingskriterium" })).toBeInTheDocument();
  });

  it("reads the whole document for the evaluation when the checklist has none, and adds a criterion from its page", async () => {
    mockApi([
      ...routes({ ...draftChecklistView, checklist: { ...draftChecklistView.checklist, evaluation: [] } }),
      page(9, "4 Utvärdering\nUtvärderingen görs på grunden pris (16 kap. 1 § LOU)."),
    ]);
    open();

    const checks = await screen.findByRole("list", { name: "Automatiska kontroller" });
    expect(
      await within(checks).findByText(
        "Inga utvärderingskriterier hittades, men underlaget har kapitlet 4 Utvärdering på sida 9.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(within(checks).getByRole("button", { name: "Lägg till utvärderingskriterier" }));
    const dialog = await screen.findByRole("dialog", { name: "Nytt utvärderingskriterium" });
    expect((within(dialog).getByLabelText(/Sida i underlaget/) as HTMLInputElement).value).toBe("9");
  });

  it("filters the rows to check: a source not found, on another page, or under the wrong heading", async () => {
    mockApi([
      ...routes(draftChecklistView),
      page(4, "2 Kvalificering\nLeverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor."),
      page(6, "Anbudsgivaren ska redovisa två referensuppdrag."),
    ]);
    open();

    const checks = await screen.findByRole("list", { name: "Automatiska kontroller" });
    expect(await within(checks).findByText(/Ett krav under rubriken 2 Kvalificering är tolkat som Skallkrav\./)).toBeInTheDocument();
    expect(screen.getByText("Står under 2 Kvalificering")).toBeInTheDocument();

    await userEvent.click(within(checks).getByRole("button", { name: "Visa krav vars typ inte stämmer med rubriken" }));
    expect(screen.getByRole("radio", { name: "Flaggade (3)" })).toBeChecked();
    expect(screen.queryByText("Pris 70 %")).not.toBeInTheDocument();
    expect(screen.getByText("Prisbilaga")).toBeInTheDocument();
  });

  it("keeps the buyer's Kontrollerad marks in this browser", async () => {
    mockApi(routes(draftChecklistView));
    const { unmount } = open();

    await userEvent.click(await screen.findByRole("checkbox", { name: "Kontrollerad: Två referensuppdrag" }));
    expect(screen.getByRole("progressbar", { name: "Kontrollerat 1 av 6" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(`anbudsklar:granskning:${CHECKLIST_ID}`) ?? "[]")).toEqual(["krav:K2"]);

    unmount();
    open();
    expect(await screen.findByRole("checkbox", { name: "Kontrollerad: Två referensuppdrag" })).toBeChecked();
  });
});

describe("ChecklistReviewPage: the source beside the list", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("min-width: 1200px"),
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
  });

  it("shows the chosen row's page with its quote marked, and edits beside it", async () => {
    mockApi([
      ...routes(draftChecklistView),
      page(4, "3.2 Försäkring\nLeverantören ska ha en ansvarsförsäkring om minst 5 000 000 kronor."),
      page(6, "Anbudsgivaren ska redovisa två referensuppdrag."),
    ]);
    open();

    const pane = await screen.findByRole("region", { name: "Källan i underlaget" });
    // The first row whose source deviates opens first: the quote was found on page 6, not 5.
    expect(await within(pane).findByText("Citatet står på sida 6 (AI angav 5) och är markerat nedan.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Ansvarsförsäkring om minst 5 miljoner kronor/ }));
    expect(await within(pane).findByText("Citatet står på sida 4 och är markerat nedan.")).toBeInTheDocument();
    expect(within(pane).getByRole("heading", { name: "Sida 4 av 16" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Fler val: Ansvarsförsäkring om minst 5 miljoner kronor" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ändra" }));
    const form = await within(pane).findByRole("form", { name: "Ändra kravet" });
    expect(within(form).getByText("Citatet står på sida 4.")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Använd markeringen som citat" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Ändra kravet" })).not.toBeInTheDocument();
    // The row being edited says so, and a changed type says what it was.
    const row = screen.getByRole("checkbox", { name: "Kontrollerad: Ansvarsförsäkring om minst 5 miljoner kronor" }).closest("li")!;
    expect(within(row).getByText("Ändras")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("combobox", { name: /Typ av krav/ }));
    await userEvent.click(await screen.findByRole("option", { name: /^Avtalsvillkor/ }));
    expect(await within(form).findByText("Var: Skallkrav")).toBeInTheDocument();
  });
});
