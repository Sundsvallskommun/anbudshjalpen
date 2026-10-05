import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { useReviewDraft } from "../../api/queries";
import type { CheckStatus, CitationCheck, NoticeDetail, RequirementCheck, ReviewView, UserView } from "../../api/types";
import { Row, RowList } from "../../components/RowList";
import { ErrorNotice } from "../../components/states";
import { CheckStatusToken } from "../../components/tokens";
import { ATTACHMENT_STATUS, engineLabel } from "../../lib/labels";

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 20 * 1024 * 1024;

// What needs attention first: missing, then unproven, unclear, and last what is fulfilled.
const ORDER: Record<CheckStatus, number> = { saknas: 0, obevisat: 1, oklart: 2, uppfyllt: 3 };

export function sortChecks(checks: readonly RequirementCheck[]): RequirementCheck[] {
  return [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}

function draftQuoteStatus(check: CitationCheck | null): string {
  if (check === "verified") return "citatet finns i utkastet";
  if (check === "moved") return "citatet finns på en annan sida i utkastet";
  return "citatet kunde inte hittas i utkastet";
}

function CheckItem({ check, title }: { check: RequirementCheck; title: string }) {
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={4}>{title}</Heading>
        <CheckStatusToken status={check.status} />
      </HStack>
      <Text as="p">{check.comment}</Text>
      {check.draft_quote && (
        <VStack gap={1}>
          <Text type="supporting">
            {`Ur ditt utkast${check.draft_page ? `, sida ${check.draft_page}` : ""}: ${draftQuoteStatus(check.draft_check)}`}
          </Text>
          <Text as="p">”{check.draft_quote}”</Text>
        </VStack>
      )}
    </VStack>
  );
}

function ReviewResultView({ view }: { view: ReviewView }) {
  const { result, requirement_titles: titles } = view;
  const counts = result.checks.reduce<Record<CheckStatus, number>>(
    (total, check) => ({ ...total, [check.status]: total[check.status] + 1 }),
    { saknas: 0, obevisat: 0, oklart: 0, uppfyllt: 0 },
  );
  return (
    <VStack gap={6} as="section" aria-labelledby="review-result-heading">
      <VStack gap={3}>
        <Heading level={2} id="review-result-heading">
          Resultat av granskningen
        </Heading>
        <Text as="p">{result.summary}</Text>
        <HStack gap={2} wrap="wrap">
          {(Object.keys(ORDER) as CheckStatus[])
            .filter((status) => counts[status] > 0)
            .map((status) => (
              <CheckStatusToken key={status} status={status} count={counts[status]} />
            ))}
        </HStack>
      </VStack>
      <VStack gap={3}>
        <Heading level={3}>Krav för krav</Heading>
        <RowList label="Krav för krav">
          {sortChecks(result.checks).map((check) => (
            <Row key={check.requirement_id}>
              <CheckItem check={check} title={titles[check.requirement_id] ?? check.requirement_id} />
            </Row>
          ))}
        </RowList>
      </VStack>
      {result.attachments.length > 0 && (
        <VStack gap={3}>
          <Heading level={3}>Bilagor</Heading>
          <RowList label="Bilagor">
            {result.attachments.map((attachment) => (
              <Row key={attachment.name}>
                <VStack gap={1}>
                  <Text>
                    <Text weight="semibold">{attachment.name}:</Text> {ATTACHMENT_STATUS[attachment.status]}
                  </Text>
                  <Text color="secondary">{attachment.comment}</Text>
                </VStack>
              </Row>
            ))}
          </RowList>
        </VStack>
      )}
      <Text type="supporting">
        {`Granskningen pekar ut brister men skriver inte om ditt anbud. Utkastet har inte sparats. AI-genererad granskning (${engineLabel(view.engine)}).`}
      </Text>
    </VStack>
  );
}

/** Journey step 6: the draft is checked requirement by requirement and is never stored. */
export function ReviewTab({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  const [file, setFile] = useState<File | null>(null);
  const review = useReviewDraft(notice.id);
  const { pathname, search } = useLocation();

  if (notice.checklist?.status !== "published") {
    return (
      <EmptyState
        headingLevel={2}
        title="Granskning går inte att göra ännu"
        description="Utkastet granskas mot den publicerade checklistan, och den finns inte för den här upphandlingen ännu."
      />
    );
  }
  if (user?.role !== "foretagare") {
    return (
      <EmptyState
        headingLevel={2}
        title="Logga in som företagare för att granska ett utkast"
        description="Granskningen visar krav för krav vad som saknas eller är obevisat i ditt anbudsutkast."
        actions={
          <Button
            label="Logga in"
            variant="primary"
            href={`/logga-in?till=${encodeURIComponent(pathname + search)}`}
          />
        }
      />
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (file) review.mutate(file);
  };

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>Granska ditt anbudsutkast</Heading>
        <Text color="secondary">
          Ladda upp utkastet så jämförs det med kraven i checklistan. Du ser vad som saknas eller inte är bevisat
          innan du lämnar anbudet i e-Avrop.
        </Text>
      </VStack>
      <Banner
        status="info"
        title="Utkastet sparas inte"
        description="Filen skickas till AI-tjänsten för granskningen och slängs direkt efteråt. Varken filen eller texten sparas."
        collapsible={false}
      />
      <form onSubmit={onSubmit} aria-label="Granska ett anbudsutkast">
        <VStack gap={3} hAlign="start">
          <FileInput
            label="Anbudsutkast"
            description="PDF, Word eller text, högst 20 MB."
            value={file}
            onChange={(next) => setFile(Array.isArray(next) ? (next[0] ?? null) : next)}
            accept={ACCEPT}
            maxSize={MAX_BYTES}
            mode="dropzone"
            width="100%"
          />
          <Button
            type="submit"
            label="Granska utkastet"
            variant="primary"
            isLoading={review.isPending}
            isDisabled={!file}
          />
          {review.isPending && <Text color="secondary">Läser utkastet och jämför med kraven …</Text>}
        </VStack>
      </form>
      {review.isError && <ErrorNotice title="Utkastet kunde inte granskas" error={review.error} />}
      {review.isSuccess && <ReviewResultView view={review.data} />}
    </VStack>
  );
}
