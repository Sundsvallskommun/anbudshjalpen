import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { PUBLISHED_ANSWERS_ID, PUBLISHED_ANSWERS_TITLE } from "../ui/PublishedAnswerQuote";
import { SectionRow, SectionRows } from "./SectionRow";

/** The anchor of the open questions section, for the outline. */
export const OPEN_QUESTIONS_ID = "oklart";
export const OPEN_QUESTIONS_TITLE = "Oklart i underlaget";

/**
 * What the document leaves open. Only the formal question in e-Avrop settles it for everyone (likabehandling), so the
 * section says where to ask and by when (`questionDeadline`, "30 oktober"). The checklist leaves out what inköp's
 * published answers settle (decision 0018); when there are answers, the section points to them first, since one that
 * came after the checklist was made may already answer a row here.
 */
export function OpenQuestions({
  questions,
  questionDeadline,
  answeredCount = 0,
}: {
  questions: readonly string[];
  questionDeadline: string | null;
  /** How many questions inköp has answered in e-Avrop, listed under "Frågor och svar från inköp". */
  answeredCount?: number;
}) {
  if (questions.length === 0) return null;
  const when = questionDeadline ? `senast ${questionDeadline}` : "före sista dag för frågor";
  const ask = `Ställ frågan i e-Avrop ${when}, så får alla leverantörer samma svar.`;
  const helper =
    answeredCount > 0 ? (
      <>
        Se först om inköp redan har svarat under{" "}
        <Link href={`#${PUBLISHED_ANSWERS_ID}`} size="sm" hasUnderline>
          {PUBLISHED_ANSWERS_TITLE}
        </Link>
        . Är något av det här viktigt för ditt anbud och obesvarat? {ask}
      </>
    ) : (
      `Är något av det viktigt för ditt anbud? ${ask}`
    );
  return (
    <CollapsibleSection
      id={OPEN_QUESTIONS_ID}
      title={OPEN_QUESTIONS_TITLE}
      count={questions.length}
      countNoun={["fråga", "frågor"]}
      helper={helper}
      value={OPEN_QUESTIONS_ID}
    >
      <SectionRows>
        {questions.map((question) => (
          <SectionRow key={question} label={<Text>{question}</Text>} />
        ))}
      </SectionRows>
    </CollapsibleSection>
  );
}
