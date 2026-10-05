import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChecklistUpdate, ChecklistView, RejectRequest } from "../../api/types";
import {
  buyerUser,
  CHECKLIST_ID,
  checklistView,
  DOCUMENT_ID,
  draftChecklistView,
  NOTICE_ID,
  noticeDetail,
} from "../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../test/render";
import { nextRequirementId } from "./ChecklistReviewPage";

const routes = (view: ChecklistView): MockRoute[] => [
  ...baseRoutes(buyerUser),
  { method: "GET", path: `/api/admin/checklists/${CHECKLIST_ID}`, body: view },
  { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail },
];

describe("ChecklistReviewPage", () => {
  it("approves a draft and then offers to publish it", async () => {
    const calls = mockApi([
      ...routes(draftChecklistView),
      {
        method: "POST",
        path: `/api/admin/checklists/${CHECKLIST_ID}/approve`,
        body: { ...draftChecklistView, status: "approved" },
      },
    ]);
    renderApp(`/inkop/checklistor/${CHECKLIST_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: "Godkänn" }));
    expect(await screen.findByRole("button", { name: "Publicera för företagen" })).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/approve"))).toBe(true);
  });

  it("edits a requirement and saves the whole checklist", async () => {
    const calls = mockApi([
      ...routes(draftChecklistView),
      {
        method: "PUT",
        path: `/api/admin/checklists/${CHECKLIST_ID}`,
        body: (update: unknown) => ({ ...draftChecklistView, checklist: (update as ChecklistUpdate).checklist }),
      },
    ]);
    renderApp(`/inkop/checklistor/${CHECKLIST_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: "Ändra Två referensuppdrag" }));
    const dialog = await screen.findByRole("dialog", { name: "Ändra krav" });
    const title = within(dialog).getByRole("textbox", { name: /Rubrik/ });
    await userEvent.clear(title);
    await userEvent.type(title, "Tre referensuppdrag");
    await userEvent.click(within(dialog).getByRole("button", { name: "Spara kravet" }));

    expect(screen.getByRole("button", { name: "Godkänn" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Spara ändringar" }));

    const saved = calls.find((call) => call.method === "PUT")?.body as ChecklistUpdate;
    expect(saved.checklist.requirements[1]?.title).toBe("Tre referensuppdrag");
    expect(await screen.findByRole("heading", { level: 4, name: "Tre referensuppdrag" })).toBeInTheDocument();
  });

  it("withdraws a published checklist with a reason", async () => {
    const calls = mockApi([
      ...routes(checklistView),
      {
        method: "POST",
        path: `/api/admin/checklists/${CHECKLIST_ID}/withdraw`,
        body: (request: unknown) => ({
          ...checklistView,
          status: "rejected",
          reviewer_note: (request as RejectRequest).note,
        }),
      },
    ]);
    renderApp(`/inkop/checklistor/${CHECKLIST_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: "Dra tillbaka" }));
    const dialog = await screen.findByRole("dialog", { name: "Dra tillbaka checklistan" });
    const submit = within(dialog).getByRole("button", { name: "Dra tillbaka" });
    expect(submit).toBeDisabled(); // a reason is required
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Motivering/ }), "Fel sista anbudsdag.");
    await userEvent.click(submit);

    const sent = calls.find((call) => call.path.endsWith("/withdraw"))?.body as RejectRequest;
    expect(sent.note).toBe("Fel sista anbudsdag.");
    // Rejected with the reason, and editable again so it can be corrected and published anew.
    expect(await screen.findByRole("button", { name: "Spara ändringar" })).toBeInTheDocument();
    expect(screen.getAllByText("Fel sista anbudsdag.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Dra tillbaka" })).not.toBeInTheDocument();
  });

  it("asks for a new draft from the same document", async () => {
    const calls = mockApi([
      ...routes(checklistView),
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
    renderApp(`/inkop/checklistor/${CHECKLIST_ID}`);

    await userEvent.click(await screen.findByRole("button", { name: "Tolka underlaget igen" }));
    expect(await screen.findByText(/Underlaget tolkas igen/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("/interpret"))).toBe(true);
  });

  it("numbers a new requirement after the existing ones", () => {
    expect(nextRequirementId(draftChecklistView.checklist.requirements)).toBe("K3");
  });
});
