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

async function review() {
  await screen.findByRole("heading", { level: 2, name: "Granska ditt anbudsutkast" });
  await userEvent.upload(draftInput(), new File(["%PDF-1.7 utkast"], "utkast.pdf", { type: "application/pdf" }));
  await userEvent.click(screen.getByRole("button", { name: "Granska utkastet" }));
  return screen.findByRole("heading", { level: 3, name: "1 sak behöver åtgärdas innan du lämnar anbudet" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-05T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Step 3 Granska", () => {
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

  it("tells the privacy rules at the upload and what is missing when the button is pressed", async () => {
    const calls = mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    // At the upload itself, where the rules can be followed.
    const form = await screen.findByRole("form", { name: "Granska ett anbudsutkast" });
    expect(within(form).getByText("Utkastet sparas inte. Filen läses, jämförs med kraven och raderas direkt.")).toBeInTheDocument();
    expect(within(form).getByText("Ladda inte upp riktiga anbud eller personuppgifter i demon.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Granska utkastet" }));
    // The field shows the error, and Astryx's live region says it too.
    expect(await screen.findAllByText("Välj ditt anbudsutkast först.")).not.toHaveLength(0);
    expect(calls.some((call) => call.path.endsWith("/review"))).toBe(false);
    // The rail does not say again what the form says.
    const rail = screen.getByRole("complementary", { name: "Om granskningen" });
    expect(within(rail).queryByRole("heading", { name: "Utkastet sparas inte" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("checkbox", { name: "Visa bara: 1 Måste åtgärdas" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visa bara: 1 Ser bra ut" })).toBeInTheDocument();

    const attachments = screen.getByRole("list", { name: "Bilagor i utkastet: 0 av 1" });
    expect(within(attachments).getByRole("listitem")).toHaveTextContent("Prisbilaga, inte med i utkastet");

    const mustFix = screen.getByRole("region", { name: "Måste åtgärdas, 1 krav" });
    expect(within(mustFix).getByText("Bevis saknas")).toBeInTheDocument();
    expect(within(mustFix).getByText("Skallkrav")).toBeInTheDocument();
    expect(within(mustFix).getByText("Ansvarsförsäkring om minst 5 miljoner kronor")).toBeInTheDocument();
    expect(within(mustFix).getByText("Försäkringen nämns men beviset saknas.")).toBeInTheDocument();
    expect(within(mustFix).getByText("Bifoga försäkringsbevis.")).toBeInTheDocument();
    expect(within(mustFix).getByText("Ur ditt utkast, s. 2: ”Vi har ansvarsförsäkring”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ser bra ut, 1 krav" })).toHaveAttribute("aria-expanded", "false");
    // The step bar says it too, in words.
    expect(screen.getByRole("tab", { name: "Granska, behöver åtgärdas" })).toBeInTheDocument();

    const upload = calls.find((call) => call.path.endsWith("/review"));
    expect((upload?.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("shows one group alone when its figure is pressed, opened", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    await userEvent.click(screen.getByRole("checkbox", { name: "Visa bara: 1 Ser bra ut" }));
    expect(screen.queryByRole("region", { name: "Måste åtgärdas, 1 krav" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ser bra ut, 1 krav" })).toHaveAttribute("aria-expanded", "true");
  });

  it("asks about a requirement in step 2, with the question ready to send", async () => {
    mockApi([...baseRoutes(companyUser), noticeRoute, reviewRoute]);
    renderApp(`/upphandlingar/${NOTICE_ID}?flik=granska`);

    await review();
    const ask = screen.getByRole("link", { name: "Fråga om kravet ”Ansvarsförsäkring om minst 5 miljoner kronor”" });
    // Its address does the same in a new tab.
    expect(new URLSearchParams(ask.getAttribute("href")!.split("?")[1]).get("flik")).toBe("fraga");
    await userEvent.click(ask);
    expect(screen.getByRole("tab", { name: "Fråga" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Fråga" })).toHaveFocus();
    expect(await screen.findByRole("textbox", { name: /Din fråga/u })).toHaveValue(
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
    expect(screen.queryByRole("button", { name: "Granska utkastet" })).not.toBeInTheDocument();
    const [row] = screen.getAllByRole("button", { name: "Granska en ny version" });
    await userEvent.click(row!);
    expect(screen.getByRole("button", { name: "Granska utkastet" })).toBeInTheDocument();
    // The last result stays until the new one arrives.
    expect(screen.getByRole("heading", { level: 3, name: "1 sak behöver åtgärdas innan du lämnar anbudet" })).toBeInTheDocument();
  });
});
