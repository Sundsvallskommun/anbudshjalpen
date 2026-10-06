import { describe, expect, it } from "vitest";
import { findQuote } from "./highlight";
import { isSectionHeading, layoutPage } from "./pageText";

const PAGE = [
  "3.3 Ekonomisk stabilitet",
  "Anbudsgivaren ska ha en så stabil ekonomi att uppdraget kan genomföras under hela",
  "kontraktstiden.",
  "Kommunen kontrollerar detta genom en kreditupplysning.",
  "3.4 Ansvarsförsäkring",
  "Anbudsgivaren ska ha en ansvarsförsäkring som gäller för den verksamhet som uppdraget avser, med ett",
  "försäkringsbelopp på minst",
  "5 000 000 kronor per skadetillfälle.",
  "• Försäkringsbevis bifogas.",
].join("\n");

function text(block: { pieces: { text: string }[] }): string {
  return block.pieces.map((piece) => piece.text).join("");
}

describe("isSectionHeading", () => {
  it("knows a numbered heading from a line that starts with an amount or ends a sentence", () => {
    expect(isSectionHeading("3.4 Ansvarsförsäkring")).toBe(true);
    expect(isSectionHeading("1 Allmänt")).toBe(true);
    expect(isSectionHeading("5 000 000 kronor per skadetillfälle.")).toBe(false);
    expect(isSectionHeading("2 Anbudet ska vara skrivet på svenska.")).toBe(false);
    expect(isSectionHeading("Ansvarsförsäkring")).toBe(false);
  });
});

describe("layoutPage", () => {
  it("joins the PDF's lines into paragraphs between headings and list items", () => {
    const blocks = layoutPage(PAGE, null);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "paragraph", "heading", "paragraph", "paragraph"]);
    expect(text(blocks[1]!)).toBe(
      "Anbudsgivaren ska ha en så stabil ekonomi att uppdraget kan genomföras under hela kontraktstiden.",
    );
    expect(text(blocks[4]!)).toMatch(/med ett försäkringsbelopp på minst 5 000 000 kronor per skadetillfälle\.$/u);
    expect(text(blocks[5]!)).toBe("• Försäkringsbevis bifogas.");
  });

  it("marks a quote that runs over a line break, keeping the range's characters", () => {
    const range = findQuote(PAGE, "försäkringsbelopp på minst 5 000 000 kronor");
    const blocks = layoutPage(PAGE, range);
    const marked = blocks.flatMap((block) => block.pieces.filter((piece) => piece.isMatch).map((piece) => piece.text));
    expect(marked).toEqual(["försäkringsbelopp på minst 5 000 000 kronor"]);
    // Nothing is lost or added: the blocks hold the page's text, a paragraph's own line breaks as spaces.
    const joined = PAGE.replace("hela\nkontraktstiden", "hela kontraktstiden").replace(
      "med ett\nförsäkringsbelopp på minst\n5",
      "med ett försäkringsbelopp på minst 5",
    );
    expect(blocks.map(text).join("\n")).toBe(joined);
  });

  it("marks across blocks when a quote spans a heading", () => {
    const range = findQuote(PAGE, "kreditupplysning. 3.4 Ansvarsförsäkring");
    const blocks = layoutPage(PAGE, range);
    expect(blocks.filter((block) => block.pieces.some((piece) => piece.isMatch)).map((block) => block.kind)).toEqual([
      "paragraph",
      "heading",
    ]);
  });
});
