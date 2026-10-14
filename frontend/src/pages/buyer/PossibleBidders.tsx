import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { pixel, proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useSearchSuppliers, useUpcoming } from "../../api/queries";
import type { SupplierCpvMatch, SupplierMatch, SupplierSearch } from "../../api/types";
import { ErrorNotice } from "../../components/states";
import { FictitiousToken } from "../../components/tokens";
import { cpvNames } from "../notice/noticeData";
import { sortUpcoming } from "../start/upcoming";
import {
  CATALOGUE_MONTHS,
  companyFacts,
  CPV_MATCH_LABEL,
  EMPTY_JOB,
  jobErrors,
  jobFromUpcoming,
  jobRequest,
  resultHeading,
  sharedWordsText,
  type JobDraft,
  type JobField,
} from "./bidders";

interface BidderRow extends Record<string, unknown> {
  item: SupplierMatch;
}

/** A workshop participant's own company (decision 0010): grey metadata, like "Fiktiv". */
function LabToken() {
  return (
    <Token
      label="Testföretag"
      color="gray"
      size="sm"
      icon={<Icon icon="info" size="sm" />}
      description="Skapat av en deltagare på en träff"
    />
  );
}

/** How close the company's nearest CPV code is: green for the code or its category, grey for the wider group. */
function CpvMatchToken({ match }: { match: SupplierCpvMatch }) {
  const isClose = match.kind !== "same_group";
  return (
    <Token
      label={CPV_MATCH_LABEL[match.kind]}
      color={isClose ? "green" : "gray"}
      size="sm"
      icon={<Icon icon={isClose ? "success" : "info"} size="sm" />}
    />
  );
}

function CompanyName({ item }: { item: SupplierMatch }) {
  const facts = companyFacts(item);
  return (
    <VStack gap={1} hAlign="start">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text weight="semibold">{item.name}</Text>
        {item.is_fictitious && <FictitiousToken size="sm" />}
        {item.is_lab && <LabToken />}
      </HStack>
      {facts && <Text type="supporting">{facts}</Text>}
    </VStack>
  );
}

/** What the company does, by the labels of its CPV codes (never the numbers alone). */
function Activities({ item }: { item: SupplierMatch }) {
  const names = cpvNames(item);
  if (names.length === 0) return <Text color="secondary">Inga CPV-koder</Text>;
  return <Text>{names.join(", ")}</Text>;
}

/** The reasons: the CPV closeness with the company code's label, and the words the job shares with its description. */
function Reasons({ item }: { item: SupplierMatch }) {
  const words = sharedWordsText(item.shared_words);
  return (
    <VStack gap={1} hAlign="start">
      {item.cpv_match && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <CpvMatchToken match={item.cpv_match} />
          {item.cpv_match.label && <Text type="supporting">{item.cpv_match.label}</Text>}
        </HStack>
      )}
      {words && <Text type="supporting">{words}</Text>}
    </VStack>
  );
}

const COLUMNS: TableColumn<BidderRow>[] = [
  { key: "company", header: "Företag", width: proportional(3, { minWidth: 200 }), renderCell: ({ item }) => <CompanyName item={item} /> },
  { key: "activities", header: "Verksamhet", width: proportional(3), renderCell: ({ item }) => <Activities item={item} /> },
  { key: "reasons", header: "Därför", width: pixel(260), renderCell: ({ item }) => <Reasons item={item} /> },
];

/** Narrower than the full table fits (on a phone or zoomed in) everything stands under the company's name. */
const NARROW_QUERY = "(width < 900px)";

function NarrowCompany({ item }: { item: SupplierMatch }) {
  return (
    <VStack gap={2} hAlign="start">
      <CompanyName item={item} />
      <Activities item={item} />
      <Reasons item={item} />
    </VStack>
  );
}

const NARROW_COLUMNS: TableColumn<BidderRow>[] = [
  { key: "company", header: "Företag", width: proportional(1, { minWidth: 0 }), renderCell: ({ item }) => <NarrowCompany item={item} /> },
];

/** What the buyer types, with the errors shown once they have tried to send it. */
function JobForm({ onSearch, isSearching }: { onSearch: (search: SupplierSearch) => void; isSearching: boolean }) {
  const upcoming = useUpcoming(CATALOGUE_MONTHS);
  const [draft, setDraft] = useState<JobDraft>(EMPTY_JOB);
  const [agreementId, setAgreementId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const errors = jobErrors(draft);
  const status = (field: JobField) => (isSubmitted && errors[field] ? { type: "error" as const, message: errors[field] } : undefined);
  const set = (changes: Partial<JobDraft>) => setDraft((previous) => ({ ...previous, ...changes }));
  const agreements = sortUpcoming(upcoming.data ?? []);

  const chooseAgreement = (value: string | null) => {
    setAgreementId(value);
    const item = agreements.find((candidate) => candidate.agreement_id === value);
    if (item) setDraft(jobFromUpcoming(item));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
    if (Object.keys(errors).length > 0) {
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    onSearch(jobRequest(draft));
  };

  return (
    <Card>
      <form onSubmit={submit} aria-label="Beskriv uppdraget" noValidate>
        <VStack gap={4}>
          <FormLayout defaultOptionality="optional">
            <Selector
              label="Utgå från en kommande upphandling"
              description="Ett avtal i katalogen som snart ska upphandlas igen fyller i fälten; ändra dem sedan som du vill."
              placeholder={upcoming.isPending ? "Hämtar avtalskatalogen …" : "Välj ett avtal"}
              options={agreements.map((item) => ({
                value: item.agreement_id,
                label: item.title,
                description: item.category ?? undefined,
              }))}
              value={agreementId}
              onChange={chooseAgreement}
              hasClear
              hasSearch={agreements.length > 8}
              searchPlaceholder="Sök avtal"
              emptyText="Inga avtal i katalogen löper ut den närmaste tiden"
              isLoading={upcoming.isPending}
              isDisabled={upcoming.isError}
            />
            <TextInput label="Rubrik" value={draft.title} onChange={(title) => set({ title })} status={status("title")} />
            <TextArea
              label="Beskrivning"
              description="Vad som ska göras, var och ungefär hur mycket. Orden jämförs med företagens egna beskrivningar."
              value={draft.description}
              onChange={(description) => set({ description })}
              rows={4}
              maxLength={8000}
              status={status("description")}
            />
            <TextInput
              label="CPV-koder"
              description="Åtta siffror, separera med kommatecken. Koderna är det som väger tyngst."
              value={draft.cpv}
              onChange={(cpv) => set({ cpv })}
              status={status("cpv")}
            />
          </FormLayout>
          <HStack gap={2} wrap="wrap">
            <Button type="submit" label="Visa möjliga anbudsgivare" variant="primary" isLoading={isSearching} />
          </HStack>
        </VStack>
      </form>
    </Card>
  );
}

/**
 * "Möjliga anbudsgivare" (decision 0023): inköp describes a job that may become a procurement, or starts from an
 * agreement in the catalogue, and sees which companies in Anbudshjälpen say they do that kind of work, with why.
 * The same fixed rules as the matching, read the other way; no model, nothing stored. The list is for market
 * analysis and gives nobody a head start: the rule is said once, above the form.
 */
export function PossibleBidders() {
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const search = useSearchSuppliers();
  const [lastSearch, setLastSearch] = useState<SupplierSearch | null>(null);
  const run = (next: SupplierSearch) => {
    setLastSearch(next);
    search.mutate(next);
  };
  const rows: BidderRow[] = (search.data ?? []).map((item) => ({ item }));

  return (
    <VStack gap={4}>
      <VStack gap={1} maxWidth="72ch">
        <Text as="p">
          Beskriv ett uppdrag som kan bli en upphandling, eller utgå från ett avtal som snart ska upphandlas igen, så
          visas vilka företag i Anbudshjälpen som säger att de gör sådant arbete. Underlag för en marknadsanalys eller
          en leverantörsdialog: finns det företag som kan svara, och behöver upphandlingen delas upp?
        </Text>
        <Text as="p" color="secondary">
          Listan bygger på företagens egna profiler, samma regler som deras träffar, och ger ingen förtur: det som
          gäller upphandlingen går till alla via e-Avrop. Inget sparas, och företagen ser inte listan.
        </Text>
      </VStack>
      <JobForm onSearch={run} isSearching={search.isPending} />
      <VStack gap={3} aria-live="polite">
        {search.isError && (
          <ErrorNotice
            title="Företagen kunde inte hämtas"
            error={search.error}
            onRetry={lastSearch ? () => run(lastSearch) : undefined}
          />
        )}
        {search.isSuccess && rows.length === 0 && (
          <Card>
            <EmptyState
              headingLevel={3}
              isCompact
              title="Inga företag verkar kunna svara"
              description="Inget företag har en CPV-kod i samma grupp som uppdraget, eller två ord ur sin beskrivning i texten. Prova fler ord om arbetet eller en bredare CPV-kod."
            />
          </Card>
        )}
        {search.isSuccess && rows.length > 0 && (
          <>
            <Heading level={3}>{resultHeading(rows.length)}</Heading>
            <Card padding={0}>
              <Table
                aria-label="Möjliga anbudsgivare"
                data={rows}
                columns={isNarrow ? NARROW_COLUMNS : COLUMNS}
                idKey={(row) => row.item.company_id}
                verticalAlign="top"
              />
            </Card>
          </>
        )}
      </VStack>
    </VStack>
  );
}
