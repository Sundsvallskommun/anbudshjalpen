import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, useState } from "react";
import type { NoticeDetail, PublishedAnswerView } from "../../../../api/types";
import { CollapsibleSection } from "../../../../components/ui/CollapsibleSection";
import {
  AnswerText,
  answerAnchor,
  answerMeta,
  paragraphsOf,
  PUBLISHED_ANSWERS_ID,
  PUBLISHED_ANSWERS_TITLE,
} from "../../../../components/ui/PublishedAnswerQuote";
import { plural } from "../../../../lib/format";
import { procurementLink } from "../../../../lib/links";
import styles from "./PublishedAnswers.module.css";

/** From this many entries the list gets a search field: more than fit on a screen. */
const SEARCH_FROM = 6;

/**
 * One question and its answer. The question is quiet, under "Fråga 3 · Besvarad 9 okt" and in the secondary colour;
 * the answer, which is what the reader came for and often as short as "Ja", sits on its own surface under it.
 */
function Entry({ entry, number }: { entry: PublishedAnswerView; number: number }) {
  return (
    <VStack as="li" gap={2} id={answerAnchor(entry.key)} className={styles.entry}>
      <VStack gap={1}>
        <Text type="label" color="secondary">
          {answerMeta(number, entry)}
        </Text>
        {paragraphsOf(entry.question).map((paragraph, index) => (
          <Text as="p" key={index} color="secondary">
            {paragraph}
          </Text>
        ))}
      </VStack>
      <AnswerText text={entry.answer} />
    </VStack>
  );
}

function matches(entry: PublishedAnswerView, query: string): boolean {
  const words = query.toLocaleLowerCase("sv").split(/\s+/u).filter(Boolean);
  const text = `${entry.question}\n${entry.answer}`.toLocaleLowerCase("sv");
  return words.every((word) => text.includes(word));
}

/**
 * Inköp's published answers to suppliers' questions (decisions 0013 and 0018): a group with its count in the heading,
 * open from the start because an answer can change what the document says. Each entry says "Fråga" and "Svar från
 * inköp" in words and gives the answer its own surface, so even "Ja" is plainly the answer to the question above it.
 * A long list gets a search field. Nothing is rendered when the notice has none, which is most notices.
 */
export function PublishedAnswers({ notice }: { notice: NoticeDetail }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const answers = notice.published_answers;
  if (answers.length === 0) return null;
  const numbered = answers.map((entry, index) => ({ entry, number: index + 1 }));
  const shown = query.trim() ? numbered.filter(({ entry }) => matches(entry, query)) : numbered;
  const eavrop = procurementLink(notice);
  return (
    <CollapsibleSection
      id={PUBLISHED_ANSWERS_ID}
      title={PUBLISHED_ANSWERS_TITLE}
      count={answers.length}
      countNoun={["fråga", "frågor"]}
      helper="Inköps svar på leverantörernas frågor i e-Avrop. Svaren gäller alla leverantörer och hör till underlaget: säger ett svar något annat än dokumenten är det svaret som gäller."
      defaultOpen
      isFlush={false}
      headingLevel={3}
    >
      <VStack gap={4}>
        {answers.length >= SEARCH_FROM && (
          <TextInput
            label="Sök bland frågorna och svaren"
            isLabelHidden
            value={query}
            onChange={setQuery}
            startIcon="search"
            hasClear
            placeholder="Sök, till exempel påslag eller försäkring"
          />
        )}
        {/* Always in the page, so a screen reader hears the first count too; empty until the reader searches. */}
        {answers.length >= SEARCH_FROM && (
          <Text type="supporting" role="status">
            {!query.trim()
              ? ""
              : shown.length === 0
                ? "Ingen fråga eller inget svar innehåller det du sökte på."
                : `${plural(shown.length, "fråga", "frågor")} av ${answers.length} innehåller det du sökte på.`}
          </Text>
        )}
        <VStack as="ol" role="list" id={listId} aria-label="Frågor och svar från inköp" gap={0} className={styles.list}>
          {shown.map(({ entry, number }) => (
            <Entry key={entry.key} entry={entry} number={number} />
          ))}
        </VStack>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Icon icon="info" size="sm" color="secondary" />
          <Text type="supporting">
            Hämtas från e-Avrop en gång om dygnet. Ett svar från i dag kan saknas här{eavrop ? "" : "."}
          </Text>
          {eavrop && (
            <Button
              label={`${eavrop.site === "eavrop" ? "Se alla svar i e-Avrop" : "Öppna annonsen"} (öppnas i en ny flik)`}
              href={eavrop.href}
              target="_blank"
              rel="noopener noreferrer"
              variant="ghost"
              size="sm"
              endContent={<Icon icon="externalLink" />}
            >
              {eavrop.site === "eavrop" ? "Se alla svar i e-Avrop" : "Öppna annonsen"}
            </Button>
          )}
        </HStack>
      </VStack>
    </CollapsibleSection>
  );
}
