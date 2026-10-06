import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { Fragment, useEffect, useMemo, useRef } from "react";
import type { TextRange } from "../../../lib/highlight";
import { layoutPage, type PagePiece } from "../../../lib/pageText";
import styles from "./PageText.module.css";

function Pieces({
  pieces,
  isFirstMatch,
  isLastMatch,
  markRef,
}: {
  pieces: PagePiece[];
  isFirstMatch: (piece: PagePiece) => boolean;
  isLastMatch: (piece: PagePiece) => boolean;
  markRef: React.Ref<HTMLElement>;
}) {
  return pieces.map((piece, index) =>
    piece.isMatch ? (
      <Fragment key={index}>
        {/* The mark is announced in words too, so its boundaries do not depend on seeing the colour (WCAG 1.3.1). */}
        {isFirstMatch(piece) && <VisuallyHidden>Markerat citat: </VisuallyHidden>}
        <mark className={styles.mark} ref={isFirstMatch(piece) ? markRef : undefined}>
          {piece.text}
        </mark>
        {isLastMatch(piece) && <VisuallyHidden> slut på citatet</VisuallyHidden>}
      </Fragment>
    ) : (
      <Fragment key={index}>{piece.text}</Fragment>
    ),
  );
}

/** Scrolls the page's own box so the mark sits a third down it, without moving the dialog around it. */
function scrollMarkIntoBox(box: HTMLElement, mark: HTMLElement) {
  const offset = mark.getBoundingClientRect().top - box.getBoundingClientRect().top;
  box.scrollTop += offset - box.clientHeight / 3;
}

/**
 * One page of a procurement document as paper: numbered section headings in semibold, paragraphs joined from the
 * PDF's lines, and the cited quote marked and scrolled into view. The quote may span several lines and blocks; it is
 * announced once, as "Markerat citat: … slut på citatet". With `label` the page scrolls in its own box (a
 * keyboard-scrollable region with that name), so what stands above it stays in view.
 */
export function PageText({
  text,
  range,
  headingLevel = 3,
  label,
}: {
  text: string;
  /** Where the quote is in `text` (lib/highlight's findQuote), or null for no mark. */
  range: TextRange | null;
  /** The outline level of the document's own section headings, below the surrounding heading. */
  headingLevel?: 3 | 4 | 5;
  /** The page's name as a scrolling region ("Sida 7 av 17 i underlaget"); without it the page does not scroll itself. */
  label?: string;
}) {
  const blocks = useMemo(() => layoutPage(text, range), [text, range]);
  const markRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const matches = blocks.flatMap((block) => block.pieces.filter((piece) => piece.isMatch));
  const first = matches[0];
  const last = matches.at(-1);
  const isScrollable = Boolean(label);

  useEffect(() => {
    const mark = markRef.current;
    if (!mark) return;
    if (isScrollable && boxRef.current) scrollMarkIntoBox(boxRef.current, mark);
    else mark.scrollIntoView?.({ block: "center" });
  }, [range, isScrollable]);

  return (
    <VStack
      ref={boxRef}
      gap={3}
      className={isScrollable ? `${styles.paper} ${styles.scrollable}` : styles.paper}
      role={isScrollable ? "region" : undefined}
      aria-label={label}
      tabIndex={isScrollable ? 0 : undefined}
    >
      <VStack gap={3} className={styles.column}>
        {blocks.map((block, index) => {
          const content = (
            <Pieces
              pieces={block.pieces}
              isFirstMatch={(piece) => piece === first}
              isLastMatch={(piece) => piece === last}
              markRef={markRef}
            />
          );
          return block.kind === "heading" ? (
            <Heading key={index} level={4} accessibilityLevel={headingLevel}>
              {content}
            </Heading>
          ) : (
            <Text key={index} as="p" className={styles.paragraph}>
              {content}
            </Text>
          );
        })}
      </VStack>
    </VStack>
  );
}
