import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import type { Checklist, Requirement, VerificationSummary } from "../../api/types";
import { formatCalendarDate, formatNumber } from "../../lib/format";
import { DATE_KIND, REQUIREMENT_KINDS } from "../../lib/labels";
import { keyDateIndex } from "../../lib/keyDates";
import { CitationChip } from "../citations/CitationChip";
import { ReminderAction } from "../ReminderAction";
import { Row, RowList } from "../RowList";
import { TermText } from "../TermText";

/**
 * The parts of a checklist (tolka_underlag's output), each a section with its own h2. Every item shows
 * its source as a citation chip that opens the page in the document with the quote marked.
 */

function ChecklistSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <VStack as="section" gap={3} aria-labelledby={id}>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      {children}
    </VStack>
  );
}

/**
 * "18 av 20 citat hittades på angiven sida …", so a reader knows how far to trust the list. Not "ordagrant":
 * the verifier also accepts a quote with small differences in wording or with an ellipsis.
 */
export function verificationSentence(summary: VerificationSummary): string {
  const { citations_total: total, citations_verified: verified, citations_moved: moved } = summary;
  const unverified = summary.citations_unverified;
  if (total === 0) return "Checklistan har inga citat att kontrollera.";
  const parts = [`${formatNumber(verified)} av ${formatNumber(total)} citat hittades på angiven sida`];
  if (moved > 0) parts.push(`${formatNumber(moved)} hittades på en annan sida`);
  if (unverified > 0) parts.push(`${formatNumber(unverified)} kunde inte kontrolleras`);
  return `${parts.join(", ")}.`;
}

export function SummarySection({
  checklist,
  verification,
}: {
  checklist: Checklist;
  verification: VerificationSummary;
}) {
  const allVerified = verification.citations_total > 0 && verification.citations_verified === verification.citations_total;
  return (
    <ChecklistSection id="checklist-summary" title="Sammanfattning">
      <TermText text={checklist.summary} terms={checklist.terms} />
      {checklist.procedure && (
        <Text>
          <Text weight="semibold">Förfarande:</Text> {checklist.procedure}
        </Text>
      )}
      <HStack gap={2} vAlign="center">
        <Icon icon={allVerified ? "success" : "info"} color={allVerified ? "success" : "accent"} size="sm" />
        <Text color="secondary">{verificationSentence(verification)}</Text>
      </HStack>
    </ChecklistSection>
  );
}

const REMINDER_KINDS = ["fragestopp", "sista_anbudsdag"] as const;

/**
 * Key dates, each with its source. `canRemind` (a published checklist on an open notice) adds "Påminn mig"
 * to the one row per kind the backend reminds about: the first dated entry, as `keyDateIndex` says. Other
 * rows of the same kind get no button, since a reminder from them would be for another date.
 */
export function DatesSection({
  checklist,
  documentId,
  noticeId,
  canRemind,
}: {
  checklist: Checklist;
  documentId: string;
  noticeId: string;
  canRemind: boolean;
}) {
  if (checklist.dates.length === 0) return null;
  const reminderRows = new Map(REMINDER_KINDS.map((kind) => [keyDateIndex(checklist, kind), kind]));
  return (
    <ChecklistSection id="checklist-dates" title="Viktiga datum">
      <RowList label="Viktiga datum">
        {checklist.dates.map((date, index) => {
          const reminderKind = reminderRows.get(index);
          return (
            <Row key={`${date.kind}-${index}`}>
              <VStack gap={2} hAlign="start">
                <Text>
                  <Text weight="semibold">{date.date ? `${DATE_KIND[date.kind]}:` : DATE_KIND[date.kind]}</Text>
                  {date.date && ` ${formatCalendarDate(date.date)}`}
                </Text>
                <Text color="secondary">{date.description}</Text>
                <HStack gap={3} vAlign="center" wrap="wrap">
                  <CitationChip citation={date.citation} documentId={documentId} />
                  {canRemind && reminderKind && date.date && (
                    <ReminderAction noticeId={noticeId} kind={reminderKind} deadline={date.date} />
                  )}
                </HStack>
              </VStack>
            </Row>
          );
        })}
      </RowList>
    </ChecklistSection>
  );
}

function RequirementItem({
  requirement,
  checklist,
  documentId,
  actions,
}: {
  requirement: Requirement;
  checklist: Checklist;
  documentId: string;
  actions?: ReactNode;
}) {
  return (
    <VStack gap={2} hAlign="start">
      <Heading level={4}>{requirement.title}</Heading>
      <TermText text={requirement.plain_language} terms={checklist.terms} />
      {requirement.evidence && (
        <Text>
          <Text weight="semibold">Så visar du det:</Text> {requirement.evidence}
        </Text>
      )}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <CitationChip citation={requirement.citation} documentId={documentId} />
        {actions}
      </HStack>
    </VStack>
  );
}

/** Requirements grouped by kind, skallkrav first. `actions` adds controls per item (the buyer's edit). */
export function RequirementsSection({
  checklist,
  documentId,
  actions,
  footer,
}: {
  checklist: Checklist;
  documentId: string;
  actions?: (requirement: Requirement, index: number) => ReactNode;
  footer?: ReactNode;
}) {
  const indexed = checklist.requirements.map((requirement, index) => ({ requirement, index }));
  return (
    <ChecklistSection id="checklist-requirements" title={`Krav (${formatNumber(checklist.requirements.length)})`}>
      {checklist.requirements.length === 0 && <Text color="secondary">Inga krav hittades i underlaget.</Text>}
      <VStack gap={6}>
      {REQUIREMENT_KINDS.map(({ kind, label, description }) => {
        const group = indexed.filter(({ requirement }) => requirement.kind === kind);
        if (group.length === 0) return null;
        return (
          <VStack key={kind} gap={2}>
            <Heading level={3}>{`${label} (${formatNumber(group.length)})`}</Heading>
            <Text color="secondary">{description}</Text>
            <RowList label={label}>
              {group.map(({ requirement, index }) => (
                <Row key={`${requirement.id}-${index}`}>
                  <RequirementItem
                    requirement={requirement}
                    checklist={checklist}
                    documentId={documentId}
                    actions={actions?.(requirement, index)}
                  />
                </Row>
              ))}
            </RowList>
          </VStack>
        );
      })}
      </VStack>
      {footer}
    </ChecklistSection>
  );
}

export function AttachmentsSection({ checklist, documentId }: { checklist: Checklist; documentId: string }) {
  if (checklist.attachments.length === 0) return null;
  return (
    <ChecklistSection id="checklist-attachments" title="Bilagor att lämna in">
      <RowList label="Bilagor">
        {checklist.attachments.map((attachment, index) => (
          <Row key={`${attachment.name}-${index}`}>
            <VStack gap={2} hAlign="start">
              <Text weight="semibold">{attachment.name}</Text>
              {attachment.description && <Text>{attachment.description}</Text>}
              <CitationChip citation={attachment.citation} documentId={documentId} />
            </VStack>
          </Row>
        ))}
      </RowList>
    </ChecklistSection>
  );
}

export function EvaluationSection({ checklist, documentId }: { checklist: Checklist; documentId: string }) {
  if (checklist.evaluation.length === 0) return null;
  return (
    <ChecklistSection id="checklist-evaluation" title="Så utvärderas anbuden">
      <RowList label="Utvärdering">
        {checklist.evaluation.map((criterion, index) => (
          <Row key={`${criterion.name}-${index}`}>
            <VStack gap={2} hAlign="start">
              <Text weight="semibold">
                {criterion.weight_percent !== null
                  ? `${criterion.name}: ${formatNumber(criterion.weight_percent)} %`
                  : criterion.name}
              </Text>
              <TermText text={criterion.how_assessed} terms={checklist.terms} />
              <CitationChip citation={criterion.citation} documentId={documentId} />
            </VStack>
          </Row>
        ))}
      </RowList>
    </ChecklistSection>
  );
}

export function TermsSection({ checklist, documentId }: { checklist: Checklist; documentId: string }) {
  if (checklist.terms.length === 0) return null;
  return (
    <ChecklistSection id="checklist-terms" title="Ord och begrepp">
      <Text color="secondary">Understrukna ord i checklistan kan du också trycka på för att se förklaringen.</Text>
      <RowList label="Ord och begrepp">
        {checklist.terms.map((term) => (
          <Row key={term.term}>
            <VStack gap={2} hAlign="start">
              <Text weight="semibold">{term.term}</Text>
              <Text>{term.explanation}</Text>
              {term.citation && <CitationChip citation={term.citation} documentId={documentId} />}
            </VStack>
          </Row>
        ))}
      </RowList>
    </ChecklistSection>
  );
}

export function OpenQuestionsSection({ checklist }: { checklist: Checklist }) {
  if (checklist.open_questions.length === 0) return null;
  return (
    <ChecklistSection id="checklist-open-questions" title="Det här är oklart i underlaget">
      <RowList label="Oklarheter">
        {checklist.open_questions.map((question) => (
          <Row key={question}>
            <Text>{question}</Text>
          </Row>
        ))}
      </RowList>
      <Text color="secondary">
        Är något av det viktigt för ditt anbud? Ställ frågan i e-Avrop före frågestoppet, så får alla leverantörer
        samma svar.
      </Text>
    </ChecklistSection>
  );
}
