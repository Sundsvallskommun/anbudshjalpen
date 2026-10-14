import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DOCUMENT_ID, NOTICE_ID } from "../test/fixtures";
import { mockApi } from "../test/render";
import { DocumentUpload } from "./DocumentUpload";
import { renderWithProviders } from "./ui/testing";

const uploadPath = `/api/admin/notices/${NOTICE_ID}/documents`;

describe("DocumentUpload", () => {
  it("says what is missing when pressed without a file, instead of being disabled", async () => {
    const calls = mockApi([]);
    renderWithProviders(<DocumentUpload noticeId={NOTICE_ID} />);

    await userEvent.click(screen.getByRole("button", { name: "Ladda upp" }));
    // The field shows the message, and Astryx also announces it in a live region after a short
    // delay, so the text appears once or twice depending on timing.
    expect(await screen.findAllByText("Välj ett underlag att ladda upp.")).not.toHaveLength(0);
    expect(calls.some((call) => call.path === uploadPath)).toBe(false);
  });

  it("uploads the document and says that the checklist is on its way", async () => {
    const calls = mockApi([
      {
        method: "POST",
        path: uploadPath,
        body: { id: DOCUMENT_ID, filename: "Förfrågningsunderlag.pdf", page_count: 12, empty_pages: 0, is_fictitious: true },
      },
    ]);
    renderWithProviders(<DocumentUpload noticeId={NOTICE_ID} />);

    await userEvent.upload(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(["%PDF-1.7"], "Förfrågningsunderlag.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Ladda upp" }));
    expect(await screen.findByText(/^Förfrågningsunderlag\.pdf är uppladdat \(12 sidor\)\./u)).toBeInTheDocument();
    expect((calls.find((call) => call.path === uploadPath)?.body as FormData).get("file")).toBeInstanceOf(File);
  });
});
