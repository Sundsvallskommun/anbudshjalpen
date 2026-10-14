import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companyUser, NOTICE_ID, noticeDetail, reviewView } from "../../../../test/fixtures";
import { baseRoutes, mockApi, renderApp, type MockRoute } from "../../../../test/render";

const noticeRoute: MockRoute = { method: "GET", path: `/api/notices/${NOTICE_ID}`, body: noticeDetail };
const reviewRoute: MockRoute = { method: "POST", path: `/api/notices/${NOTICE_ID}/review`, body: reviewView };

function draftInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

const draft = () => new File(["%PDF-1.7 utkast"], "utkast.pdf", { type: "application/pdf" });

/** Choosing the draft is what starts the review: there is no button to press after it. */
async function review() {
  await screen.findByRole("heading", { level: 2, name: "Granska ditt anbudsutkast" });
  await userEvent.upload(draftInput(), draft());
  return screen.findByRole("heading", { level: 3, name: "1 sak bör åtgärdas innan du lämnar anbudet" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Step 2 Granska", () => {
  it("asks a visitor to log in as a company first", async () => {
    mockApi([...baseRoutes(null), noticeRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    const panel = await screen.findByRole("tabpanel", { name: "Granska" });
    expect(await within(panel).findByRole("heading", { level: 2, name: "Logga in som företagare för att granska ett utkast" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Logga in" })).toHaveAttribute(
      "href",
      `/logga-in?till=${encodeURIComponent(`/upphandlingar/${NOTICE_ID}?flik=granska`)}`,
    );
  });

  it("tells the privacy rules at the upload, starts the review when the draft is chosen and shows the work", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, { ...reviewRoute, delayMs: 300 }]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    // At the upload itself, where the rules can be followed before the file leaves the device.
    const form = await screen.findByRole("form", { name: "Granska ett anbudsutkast" });
    expect(within(form).getByText("Utkastet sparas inte. Filen läses, jämförs med kraven och raderas direkt.")).toBeInTheDocument();
    expect(within(form).getByText("Ladda inte upp riktiga anbud eller personuppgifter i demon.")).toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: /Granska utkastet/u })).not.toBeInTheDocument();
    // The rail does not say again what the form says.
    const rail = screen.getByRole("complementary", { name: "Om granskningen" });
    expect(within(rail).queryByRole("heading", { name: "Utkastet sparas inte" })).not.toBeInTheDocument();

    await userEvent.upload(draftInput(), draft());
    // While the review runs: the file by name, what is being done, and how long it usually takes. No form, no
    // "Nästa steg", and the rail takes over the promise that the draft is not kept.
    expect(await screen.findByRole("progressbar", { name: /^Läser utkastet och jämför med \d+ krav$/u })).toBeInTheDocument();
    const working = screen.getByRole("status", { name: "Granskningen pågår" });
    expect(within(working).getByText("utkast.pdf")).toBeInTheDocument();
    expect(within(working).getByText("Tar oftast under en minut. Filen raderas så fort granskningen är klar.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Granska ett anbudsutkast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nästa steg" })).not.toBeInTheDocument();
    expect(within(rail).getByRole("heading", { name: "Utkastet sparas inte" })).toBeInTheDocument();

    // The answer takes the focus when it arrives.
    const title = await screen.findByRole("heading", { level: 3, name: "1 sak bör åtgärdas innan du lämnar anbudet" });
    expect(title).toHaveFocus();
    expect(screen.queryByRole("status", { name: "Granskningen pågår" })).not.toBeInTheDocument();
    expect(calls.filter((call) => call.path.endsWith("/review"))).toHaveLength(1);
  });

  it("says when the review failed and runs the same draft again on request", async () => {
    mockApi([
      ...baseRoutes(companyUser),
      noticeRoute,
      { ...reviewRoute, status: 503, body: { detail: "Granskningen är upptagen just nu. Försök om en stund." } },
    ]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await screen.findByRole("heading", { level: 2, name: "Granska ditt anbudsutkast" });
    await userEvent.upload(draftInput(), draft());
    expect((await screen.findAllByText("Utkastet kunde inte granskas")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Granskningen är upptagen just nu. Försök om en stund.").length).toBeGreaterThan(0);
    // The field is back for another file, and the same file can be sent again without choosing it anew.
    expect(screen.getByRole("form", { name: "Granska ett anbudsutkast" })).toBeInTheDocument();

    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    await userEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByRole("heading", { level: 3, name: "1 sak bör åtgärdas innan du lämnar anbudet" })).toBeInTheDocument();
    expect(screen.queryByText("Utkastet kunde inte granskas")).not.toBeInTheDocument();
    const upload = calls.find((call) => call.path.endsWith("/review"));
    expect((upload?.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("reviews a draft without keeping it and leads with what must be fixed", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    expect(screen.getByText("utkast.pdf")).toBeInTheDocument();
    expect(screen.getByText("Granskat i dag · utkastet sparades inte")).toBeInTheDocument();
    // With the form folded away, the rail keeps saying that the draft was not kept.
    const rail = screen.getByRole("complementary", { name: "Om granskningen" });
    expect(within(rail).getByRole("heading", { name: "Utkastet sparas inte" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "1 av 2 skall- och kvalificeringskrav ser bra ut" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visa bara: 1 Bör åtgärdas" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visa bara: 1 Ser bra ut" })).toBeInTheDocument();

    const attachments = screen.getByRole("list", { name: "Bilagor i utkastet: 0 av 1" });
    expect(within(attachments).getByRole("listitem")).toHaveTextContent("Prisbilaga, inte med i utkastet");

    const mustFix = screen.getByRole("region", { name: "Bör åtgärdas, 1 krav" });
    expect(within(mustFix).getByText("Bevis saknas")).toBeInTheDocument();
    expect(within(mustFix).getByText("Skallkrav")).toBeInTheDocument();
    expect(within(mustFix).getByText("Ansvarsförsäkring om minst 5 miljoner kronor")).toBeInTheDocument();
    expect(within(mustFix).getByText("Försäkringen nämns men beviset saknas.")).toBeInTheDocument();
    expect(within(mustFix).getByText("Bifoga försäkringsbevis.")).toBeInTheDocument();
    expect(within(mustFix).getByText("Ur ditt utkast, s. 2: ”Vi har ansvarsförsäkring”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ser bra ut, 1 krav" })).toHaveAttribute("aria-expanded", "false");
    // The step bar says it too, in words.
    expect(screen.getByRole("tab", { name: "Granska, bör åtgärdas" })).toBeInTheDocument();

    const upload = calls.find((call) => call.path.endsWith("/review"));
    expect((upload?.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("shows one group alone when its figure is pressed, opened", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    await userEvent.click(screen.getByRole("checkbox", { name: "Visa bara: 1 Ser bra ut" }));
    expect(screen.queryByRole("region", { name: "Bör åtgärdas, 1 krav" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ser bra ut, 1 krav" })).toHaveAttribute("aria-expanded", "true");
  });

  it("asks about a requirement in the Fråga AI panel, with the question ready to send", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    const ask = screen.getByRole("link", { name: "Fråga om kravet ”Ansvarsförsäkring om minst 5 miljoner kronor”" });
    // Its address does the same in a new tab: `?fraga=` opens the "Fråga AI" panel with the question (decision 0014).
    const params = new URLSearchParams(ask.getAttribute("href")!.split("?")[1]);
    expect(params.get("fraga")).toBe("Hur visar jag att vi uppfyller kravet ”Ansvarsförsäkring om minst 5 miljoner kronor”?");
    expect(params.get("flik")).toBeNull();
    await userEvent.click(ask);
    const panel = await screen.findByRole("dialog", { name: "Fråga AI" });
    expect(within(panel).getByRole("textbox")).toHaveTextContent(
      "Hur visar jag att vi uppfyller kravet ”Ansvarsförsäkring om minst 5 miljoner kronor”?",
    );
  });

  it("shows the requirement in step 1 from its row", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    await userEvent.click(screen.getByRole("link", { name: "Visa kravet ”Ansvarsförsäkring om minst 5 miljoner kronor”" }));
    expect(screen.getByRole("tab", { name: "Krav" })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("krav-K1")).toBeVisible();
  });

  it("folds the upload away after a review and opens it again for a new version", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    expect(screen.queryByRole("form", { name: "Granska ett anbudsutkast" })).not.toBeInTheDocument();
    const [row] = screen.getAllByRole("button", { name: "Granska en ny version" });
    await userEvent.click(row!);
    expect(screen.getByRole("form", { name: "Granska ett anbudsutkast" })).toBeInTheDocument();
    // The last result stays until the new one arrives.
    expect(screen.getByRole("heading", { level: 3, name: "1 sak bör åtgärdas innan du lämnar anbudet" })).toBeInTheDocument();
  });
});
