import { Text } from "@astryxdesign/core/Text";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { SectionRow, SectionRows } from "./SectionRow";

/** The anchor of the open questions section, for the outline. */
export const OPEN_QUESTIONS_ID = "oklart";
export const OPEN_QUESTIONS_TITLE = "Oklart i underlaget";

/**
 * What the document leaves open. Only the formal question in e-Avrop settles it for everyone (likabehandling), so the
 * section says where to ask and by when (`questionDeadline`, "30 oktober").
 */
export function OpenQuestions({ questions, questionDeadline }: { questions: readonly string[]; questionDeadline: string | null }) {
  if (questions.length === 0) return null;
  const when = questionDeadline ? `senast ${questionDeadline}` : "före sista dag för frågor";
  return (
    <CollapsibleSection
      id={OPEN_QUESTIONS_ID}
      title={OPEN_QUESTIONS_TITLE}
      count={questions.length}
      countNoun={["fråga", "frågor"]}
      helper={`Är något av det viktigt för ditt anbud? Ställ frågan i e-Avrop ${when}, så får alla leverantörer samma svar.`}
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
