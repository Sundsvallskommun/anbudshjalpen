import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistAdminItem, InsightItem, InterpretationView, NoticeCreate } from "../../api/types";
import { buyerUser, checklistAdminItem, noticeDetail } from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../test/render";

const draft: ChecklistAdminItem = checklistAdminItem;
const published: ChecklistAdminItem = {
  ...checklistAdminItem,
  id: "d5b2f8e3-4c7e-4d9f-8a1b-2c3d4e5f6a71",
  status: "published",
  created_at: "2026-09-20T09:00:00+02:00",
};
const olderDraft: ChecklistAdminItem = {
  ...checklistAdminItem,
  id: "e6c3a9f4-5d8f-4ea0-9b2c-3d4e5f6a7b82",
  created_at: "2026-09-18T09:00:00+02:00",
  verification: { citations_total: 41, citations_verified: 38, citations_moved: 1, citations_unverified: 2 },
};

const failed: InterpretationView = {
  document_id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
  notice_id: "6f1c2a52-0a43-4c47-9d7e-1f3f0c6b9a01",
  notice_title: "Ommålning av Solbackens förskola, Matfors",
  filename: "Förfrågningsunderlag.pdf",
  state: "failed",
  attempts: 5,
  error: "Underlaget är för stort för språkmodellen i Eneo. Prova en modell med större kontext.",
  retry_at: null,
  created_at: "2026-10-05T08:00:00Z",
};

function routes(checklists: ChecklistAdminItem[], extra: MockRoute[] = []): MockRoute[] {
  return [
    ...baseRoutes(buyerUser),
    { method: "GET", path: "/api/admin/checklists", body: checklists },
    { method: "GET", path: "/api/admin/interpretations", body: [] },
    ...extra,
  ];
}

describe("Inköp: Att granska", () => {
  it("counts the checklists to act on in the tab and lists them with their deadline and sources", async () => {
    mockApi(routes([draft, published, olderDraft]));
    renderApp("/inkop");

    expect(await screen.findByRole("tab", { name: "Att granska (2)" })).toHaveAttribute("aria-selected", "true");
    const table = await screen.findByRole("table", { name: "Checklistor" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);

    const current = rows[0]!;
    expect(within(current).getByRole("link", { name: draft.notice_title })).toHaveAttribute(
      "href",
      `/inkop/checklistor/${draft.id}`,
    );
    expect(within(current).getByText("Utkast")).toBeInTheDocument();
    expect(within(current).getByText("2 att kontrollera")).toBeInTheDocument();
    expect(within(current).getByRole("link", { name: `Granska ${draft.notice_title}` })).toBeInTheDocument();

    // The older draft of the same notice was replaced by the newer interpretation.
    expect(within(rows[1]!).getByText("Ersatt av nyare tolkning")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("3 att kontrollera")).toBeInTheDocument();
  });

  it("shows the published checklists in their own view, without a review button", async () => {
    mockApi(routes([draft, published]));
    renderApp("/inkop");

    await userEvent.click(await screen.findByRole("radio", { name: "Publicerade" }));
    const table = screen.getByRole("table", { name: "Checklistor" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("Publicerad")).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: /^Granska/ })).not.toBeInTheDocument();
  });

  it("says when there is nothing to act on", async () => {
    mockApi(routes([published]));
    renderApp("/inkop");

    expect(await screen.findByRole("heading", { name: "Inget att hantera" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Att hantera (0)" })).toBeChecked();
  });

  it("puts a document the worker gave up on above the queue and interprets it again", async () => {
    const calls = mockApi([
      ...baseRoutes(buyerUser),
      { method: "GET", path: "/api/admin/checklists", body: [] },
      { method: "GET", path: "/api/admin/interpretations", body: [failed] },
      {
        method: "POST",
        path: `/api/admin/documents/${failed.document_id}/interpret`,
        status: 202,
        body: { ...failed, state: "pending", attempts: 0, error: null },
      },
    ]);
    renderApp("/inkop");

    expect(await screen.findByText("1 underlag kunde inte tolkas")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Underlag utan checklista" });
    expect(within(list).getByText("Tolkningen gav upp")).toBeInTheDocument();
    expect(within(list).getByText(`Senaste fel: ${failed.error}`)).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Tolka igen: Förfrågningsunderlag.pdf" }));

    expect(await within(list).findByText(/Tolkningen har startat/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/interpret"))).toBe(true);
  });
});

describe("Inköp on a phone", () => {
  beforeEach(() => {
    // A phone is narrower than every "width < …" the layout asks about.
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: /\(width < \d+px\)/u.test(query),
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

  it("keeps the queue a table that fits the screen: the facts under the title, Granska beside them", async () => {
    mockApi(routes([draft, olderDraft]));
    renderApp("/inkop");

    const table = await screen.findByRole("table", { name: "Checklistor" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Upphandling", "Åtgärd"]);
    const current = within(table).getAllByRole("row")[1]!;
    expect(within(current).getByRole("link", { name: `Granska ${draft.notice_title}` })).toBeInTheDocument();
    expect(within(current).getByText("Sista anbudsdag")).toBeInTheDocument();
    expect(within(current).getByText("2 att kontrollera")).toBeInTheDocument();
  });

  it("shows each notice's questions with the other counts under its title", async () => {
    mockApi(routes([], [{ method: "GET", path: "/api/admin/insights", body: [hidden] }]));
    renderApp("/inkop?flik=insikter");

    const table = await screen.findByRole("table", { name: "Frågor per upphandling" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Upphandling", "Frågor"]);
    expect(within(table).getByText("1 utan svar i underlaget (33 %) · 0 till e-Avrop")).toBeInTheDocument();
  });
});

describe("Inköp: Ny upphandling", () => {
  it("validates when sent, creates the notice and offers the upload", async () => {
    const calls = mockApi(
      routes([], [{ method: "POST", path: "/api/admin/notices", body: (body: unknown) => ({ ...noticeDetail, title: (body as NoticeCreate).title }) }]),
    );
    renderApp("/inkop");

    await userEvent.click(await screen.findByRole("button", { name: "Ny upphandling" }));
    const dialog = await screen.findByRole("dialog", { name: "Ny upphandling" });
    const submit = within(dialog).getByRole("button", { name: "Skapa upphandlingen" });
    expect(submit).toBeEnabled();

    await userEvent.type(within(dialog).getByRole("textbox", { name: /CPV-koder/ }), "4544, 45442100");
    await userEvent.click(submit);
    expect(await within(dialog).findByText("Skriv en rubrik på minst tre tecken.")).toBeInTheDocument();
    expect(within(dialog).getByText(/4544 är inte en CPV-kod/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await userEvent.type(within(dialog).getByRole("textbox", { name: /Rubrik/ }), "Städning av Matfors skola");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Referensnummer/ }), " DEMO-2026-0201 ");
    const cpv = within(dialog).getByRole("textbox", { name: /CPV-koder/ });
    await userEvent.clear(cpv);
    await userEvent.type(cpv, "90911200");
    await userEvent.click(submit);

    expect(await within(dialog).findByText("Upphandlingen är skapad.")).toBeInTheDocument();
    const sent = calls.find((call) => call.method === "POST")?.body as NoticeCreate;
    expect(sent).toMatchObject({
      title: "Städning av Matfors skola",
      cpv_codes: ["90911200"],
      buyer: "Sundsvalls kommun",
      reference_number: "DEMO-2026-0201",
    });
    expect(sent.deadline_kind).toBe("tender");
    expect(within(dialog).getByRole("button", { name: "Ladda upp" })).toBeInTheDocument();
  });

  it("names the date by what it is for, and sends it", async () => {
    const calls = mockApi(
      routes([], [{ method: "POST", path: "/api/admin/notices", body: (body: unknown) => ({ ...noticeDetail, title: (body as NoticeCreate).title }) }]),
    );
    renderApp("/inkop?flik=ny");

    const dialog = await screen.findByRole("dialog", { name: "Ny upphandling" });
    expect(within(dialog).getByText("Sista anbudsdag")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Anbudsansökan" }));
    expect(within(dialog).getByText("Sista dag för anbudsansökan")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole("textbox", { name: /Rubrik/ }), "Fasadrenovering av Hedbergska");
    await userEvent.click(within(dialog).getByRole("button", { name: "Skapa upphandlingen" }));
    expect(await within(dialog).findByText("Upphandlingen är skapad.")).toBeInTheDocument();
    expect((calls.find((call) => call.method === "POST")?.body as NoticeCreate).deadline_kind).toBe("request");
  });

  it("opens from the old address and offers today's procedure names only", async () => {
    mockApi(routes([]));
    renderApp("/inkop?flik=ny");

    const dialog = await screen.findByRole("dialog", { name: "Ny upphandling" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: /Förfarande/ }));
    expect(await screen.findByRole("option", { name: "Öppet förfarande" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Annonserad upphandling under tröskelvärdena (19 kap. LOU)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Förenklat förfarande|Urvalsförfarande/ })).not.toBeInTheDocument();
  });
});

describe("Inköp: addresses from before the redesign", () => {
  it("sends the old jobs tab to Drift", async () => {
    mockApi(routes([], [{ method: "GET", path: "/api/admin/jobs", body: [] }]));
    renderApp("/inkop?flik=jobb");

    expect(await screen.findByRole("heading", { level: 1, name: "Drift" })).toBeInTheDocument();
  });
});

const hidden: InsightItem = {
  notice_id: noticeDetail.id,
  notice_title: noticeDetail.title,
  deadline_at: "2026-11-09T23:59:00+01:00",
  question_count: 3,
  not_in_document_count: 1,
  formal_question_suggestions: 0,
  sample_questions: [],
  visible: false,
};

const visible: InsightItem = {
  ...hidden,
  notice_id: "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
  notice_title: "Snöröjning i Kvissleby",
  deadline_at: "2026-09-30T12:00:00+02:00",
  sample_questions: ["Ingår sandning av gångvägar?"],
  visible: true,
};

describe("Inköp: Företagens frågor", () => {
  it("shows the counts, hides the questions until sista anbudsdag and writes zero as a dash", async () => {
    mockApi(routes([], [{ method: "GET", path: "/api/admin/insights", body: [hidden, visible] }]));
    renderApp("/inkop?flik=insikter");

    const table = await screen.findByRole("table", { name: "Frågor per upphandling" });
    const [, first, second] = within(table).getAllByRole("row");
    expect(within(first!).getByText("1 (33 %)")).toBeInTheDocument();
    expect(within(first!).getByText("Frågorna är dolda. Visas från 10 nov.")).toBeInTheDocument();
    expect(within(first!).getAllByText("–").length).toBeGreaterThan(0);

    await userEvent.click(within(second!).getByRole("button", { name: /Senaste frågorna \(1\)/ }));
    await waitFor(() => expect(within(second!).getByText("Ingår sandning av gångvägar?")).toBeVisible());
  });
});
