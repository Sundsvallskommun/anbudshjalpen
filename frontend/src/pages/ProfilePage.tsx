import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { Typeahead, type SearchableItem, type SearchSource } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { useMemo, useState, type FormEvent } from "react";
import { searchCpv, useProfile, useSuggestCpv, useUpdateProfile } from "../api/queries";
import type { CompanyUpdate, CompanyView, CpvSuggestion } from "../api/types";
import { Row, RowList } from "../components/RowList";
import { ErrorNotice, Loading } from "../components/states";
import { FictitiousToken } from "../components/tokens";
import { formatSek, splitList } from "../lib/format";
import { engineLabel } from "../lib/labels";
import { Page } from "../shell/Page";
import { RequireRole } from "../shell/RequireRole";

const MAX_DESCRIPTION = 4000;
const MIN_DESCRIPTION_FOR_SUGGESTIONS = 10;
const MAX_CPV = 30;

const cpvSource: SearchSource<SearchableItem> = {
  search: async (query) => (await searchCpv(query)).map((hit) => ({ id: hit.code, label: `${hit.code} ${hit.label}` })),
  bootstrap: () => [],
};

function CpvSuggestions({
  suggestions,
  engine,
  selected,
  onAdd,
}: {
  suggestions: CpvSuggestion[];
  engine: string;
  selected: readonly string[];
  onAdd: (suggestion: CpvSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return <Text color="secondary">Inga förslag hittades. Beskriv gärna verksamheten mer utförligt.</Text>;
  }
  return (
    <VStack gap={2}>
      <VStack gap={0}>
        <Text weight="semibold">Förslag</Text>
        <Text type="supporting">{`Framtagna automatiskt (${engineLabel(engine)}). Lägg till de som stämmer.`}</Text>
      </VStack>
      <RowList label="Förslag på CPV-koder">
        {suggestions.map((suggestion) => {
          const isAdded = selected.includes(suggestion.code);
          return (
            <Row key={suggestion.code}>
              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={1}>
                  <Text weight="semibold">{`${suggestion.code} ${suggestion.label}`}</Text>
                  <Text color="secondary">{suggestion.reason}</Text>
                </VStack>
                {isAdded ? (
                  <HStack gap={1} vAlign="center">
                    <Icon icon="check" color="success" size="sm" />
                    <Text>Tillagd</Text>
                  </HStack>
                ) : (
                  <Button
                    label={`Lägg till ${suggestion.code} ${suggestion.label}`}
                    size="sm"
                    onClick={() => onAdd(suggestion)}
                  >
                    Lägg till
                  </Button>
                )}
              </HStack>
            </Row>
          );
        })}
      </RowList>
    </VStack>
  );
}

function ProfileForm({ profile }: { profile: CompanyView }) {
  const [description, setDescription] = useState(profile.description);
  const [cpvCodes, setCpvCodes] = useState<string[]>(profile.cpv_codes);
  const [labels, setLabels] = useState<Record<string, string>>(profile.cpv_labels);
  const [municipalities, setMunicipalities] = useState(profile.municipalities.join(", "));
  const [employees, setEmployees] = useState<number | null>(profile.employees);
  const [turnover, setTurnover] = useState<number | null>(profile.annual_turnover_sek);
  const [certifications, setCertifications] = useState(profile.certifications.join(", "));
  const [insurance, setInsurance] = useState(profile.insurance ?? "");
  const [references, setReferences] = useState(profile.public_references ?? "");
  const suggest = useSuggestCpv();
  const save = useUpdateProfile();

  const addCode = (code: string, label: string) => {
    setLabels((previous) => ({ ...previous, [code]: label }));
    setCpvCodes((previous) => (previous.includes(code) || previous.length >= MAX_CPV ? previous : [...previous, code]));
    save.reset();
  };
  const removeCode = (code: string) => {
    setCpvCodes((previous) => previous.filter((candidate) => candidate !== code));
    save.reset();
  };

  const update = useMemo<CompanyUpdate>(
    () => ({
      description: description.trim(),
      cpv_codes: cpvCodes,
      municipalities: splitList(municipalities),
      employees,
      annual_turnover_sek: turnover,
      certifications: splitList(certifications),
      insurance: insurance.trim() || null,
      public_references: references.trim() || null,
    }),
    [description, cpvCodes, municipalities, employees, turnover, certifications, insurance, references],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(update);
  };

  const tooLong = description.length > MAX_DESCRIPTION;
  const canSuggest = description.trim().length >= MIN_DESCRIPTION_FOR_SUGGESTIONS && !tooLong;
  return (
    <form onSubmit={onSubmit} aria-label="Företagsprofil">
      <VStack gap={8}>
        <VStack gap={3} as="section" aria-labelledby="profile-description">
          <Heading level={2} id="profile-description">
            Vad gör ni?
          </Heading>
          <TextArea
            label="Beskriv företaget"
            description="Skriv med egna ord vilka tjänster ni erbjuder, var ni arbetar och hur stora uppdrag ni tar."
            value={description}
            onChange={(value) => {
              setDescription(value);
              save.reset();
            }}
            rows={6}
            maxLength={MAX_DESCRIPTION}
            status={tooLong ? { type: "error", message: `Beskrivningen får vara högst ${MAX_DESCRIPTION} tecken.` } : undefined}
          />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button
              label="Föreslå CPV-koder"
              isLoading={suggest.isPending}
              isDisabled={!canSuggest}
              onClick={() => suggest.mutate(description.trim())}
            />
            {!canSuggest && !tooLong && <Text color="secondary">Skriv minst några ord först.</Text>}
          </HStack>
          {suggest.isError && <ErrorNotice title="Inga förslag kunde tas fram" error={suggest.error} />}
          {suggest.isSuccess && (
            <CpvSuggestions
              suggestions={suggest.data.suggestions.suggestions}
              engine={suggest.data.engine}
              selected={cpvCodes}
              onAdd={(suggestion) => addCode(suggestion.code, suggestion.label)}
            />
          )}
        </VStack>

        <VStack gap={3} as="section" aria-labelledby="profile-cpv">
          <Heading level={2} id="profile-cpv">
            CPV-koder
          </Heading>
          <Text color="secondary">
            CPV-koder beskriver vad en upphandling gäller. Bevakningen hittar upphandlingar med samma eller närliggande
            koder.
          </Text>
          {cpvCodes.length === 0 ? (
            <Text>Inga koder valda ännu.</Text>
          ) : (
            <HStack gap={2} wrap="wrap" role="list" aria-label="Valda CPV-koder">
              {cpvCodes.map((code) => (
                <Token
                  key={code}
                  role="listitem"
                  label={labels[code] ? `${code} ${labels[code]}` : code}
                  onRemove={() => removeCode(code)}
                />
              ))}
            </HStack>
          )}
          <Typeahead
            label="Lägg till en CPV-kod"
            description="Sök på kod eller ord, till exempel 45442 eller målning."
            searchSource={cpvSource}
            value={null}
            onChange={(item) => item && addCode(item.id, item.label.slice(item.id.length + 1))}
            minQueryLength={2}
            debounceMs={250}
            emptySearchResultsText="Inga koder hittades"
          />
        </VStack>

        <VStack gap={3} as="section" aria-labelledby="profile-facts">
          <Heading level={2} id="profile-facts">
            Om företaget
          </Heading>
          <FormLayout defaultOptionality="optional">
            <TextInput
              label="Kommuner där ni tar uppdrag"
              description="Separera med kommatecken."
              value={municipalities}
              onChange={setMunicipalities}
            />
            <NumberInput
              label="Antal anställda"
              value={employees}
              onChange={(value) => setEmployees(Number.isFinite(value) ? value : null)}
              min={0}
            />
            <NumberInput
              label="Omsättning per år (kr)"
              value={turnover}
              onChange={(value) => setTurnover(Number.isFinite(value) ? value : null)}
              min={0}
              step={100000}
              formatValue={formatSek}
            />
            <TextInput
              label="Certifieringar"
              description="Till exempel ISO 14001. Separera med kommatecken."
              value={certifications}
              onChange={setCertifications}
            />
            <TextInput label="Försäkringar" description="Till exempel ansvarsförsäkring 10 mnkr." value={insurance} onChange={setInsurance} />
            <TextArea
              label="Tidigare uppdrag åt offentliga beställare"
              value={references}
              onChange={setReferences}
              rows={3}
              maxLength={2000}
            />
          </FormLayout>
        </VStack>

        <VStack gap={3} hAlign="start">
          <Button type="submit" label="Spara profilen" variant="primary" isLoading={save.isPending} isDisabled={tooLong} />
          {save.isSuccess && (
            <Banner
              status="success"
              title="Profilen är sparad"
              description="Bevakningen bedömer upphandlingarna på nytt utifrån de nya uppgifterna."
              collapsible={false}
            />
          )}
          {save.isError && <ErrorNotice title="Profilen kunde inte sparas" error={save.error} />}
        </VStack>
      </VStack>
    </form>
  );
}

function ProfileContent() {
  const profile = useProfile();
  if (profile.isPending) return <Loading label="Hämtar profilen …" />;
  if (profile.isError) {
    return <ErrorNotice title="Profilen kunde inte hämtas" error={profile.error} onRetry={() => profile.refetch()} />;
  }
  return (
    <VStack gap={6}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text weight="semibold">{profile.data.name}</Text>
        {profile.data.org_number && <Text color="secondary">{`Org.nr ${profile.data.org_number}`}</Text>}
        {profile.data.is_fictitious && <FictitiousToken />}
      </HStack>
      <ProfileForm profile={profile.data} />
    </VStack>
  );
}

/** Journey step 1: the company describes itself and gets CPV codes suggested, with reasons. */
export default function ProfilePage() {
  return (
    <RequireRole role="foretagare" title="Företagsprofil">
      {() => (
        <Page
          title="Företagsprofil"
          width={760}
          intro="Beskriv företaget en gång. Anbudsklar använder profilen för att hitta upphandlingar som passar och för att bedöma hur väl ni uppfyller kraven."
        >
          <ProfileContent />
        </Page>
      )}
    </RequireRole>
  );
}
