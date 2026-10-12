import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Tokenizer } from "@astryxdesign/core/Tokenizer";
import { TypeaheadItem } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, useMemo } from "react";
import { formatNumber } from "../../lib/format";
import { useIsPhone } from "../../lib/usePhone";
import {
  chipValues,
  coverOf,
  KNOWN_CERTIFICATIONS,
  LIMITS,
  NEARBY_MUNICIPALITIES,
  wordChips,
  wordSource,
  type DraftField,
  type ProfileDraft,
} from "./profileDraft";

const municipalitySource = wordSource(NEARBY_MUNICIPALITIES);
const certificationSource = wordSource(Object.keys(KNOWN_CERTIFICATIONS), KNOWN_CERTIFICATIONS);

/** A cleared number field means "not given". */
function numberOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

export interface CompanyFactsProps {
  draft: ProfileDraft;
  errors: Partial<Record<DraftField, string>>;
  onChange: (changes: Partial<ProfileDraft>) => void;
}

/**
 * "Om företaget": the facts requirements usually ask about, with a hint at what they ask (direction.md, section 4).
 * The short number fields sit two by two; places and certifications are chips. A phone gives the longer texts more
 * rows, so they show without scrolling.
 */
export function CompanyFacts({ draft, errors, onChange }: CompanyFactsProps) {
  const headingId = useId();
  const isPhone = useIsPhone();
  const municipalities = useMemo(() => wordChips(draft.municipalities), [draft.municipalities]);
  const certifications = useMemo(() => wordChips(draft.certifications), [draft.certifications]);

  return (
    <Card>
      <VStack as="section" gap={5} aria-labelledby={headingId}>
        <Heading level={3} accessibilityLevel={2} id={headingId}>
          Om företaget
        </Heading>
        <FormLayout defaultOptionality="optional">
          <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
            <NumberInput
              label="Antal anställda"
              description="Alla som arbetar i företaget, du själv inräknad."
              value={draft.employees}
              onChange={(value: number | null) => onChange({ employees: numberOrNull(value) })}
              min={0}
              isIntegerOnly
              hasClear
            />
            <NumberInput
              label="Omsättning per år"
              description="Upphandlingar kan kräva en lägsta omsättning."
              value={draft.turnover}
              onChange={(value: number | null) => onChange({ turnover: numberOrNull(value) })}
              min={0}
              step={100000}
              units="kr"
              formatValue={formatNumber}
              isIntegerOnly
              hasClear
            />
          </Grid>
          <Tokenizer
            label="Kommuner där ni tar uppdrag"
            description="Välj bland kommunerna i Västernorrland eller skriv en annan."
            searchSource={municipalitySource}
            value={municipalities}
            onChange={(items) => onChange({ municipalities: chipValues(items) })}
            placeholder="Till exempel Sundsvall"
            hasEntriesOnFocus
            maxEntries={LIMITS.municipalities}
            debounceMs={0}
          />
          <Tokenizer
            label="Certifieringar"
            description="Välj i listan eller skriv en egen. Sök på namnet eller på vad den gäller, till exempel miljö."
            placeholder="Till exempel ISO 9001"
            searchSource={certificationSource}
            renderItem={(item) => <TypeaheadItem item={item} description={coverOf(KNOWN_CERTIFICATIONS, item.id)} />}
            hasEntriesOnFocus
            value={certifications}
            onChange={(items) => onChange({ certifications: chipValues(items) })}
            maxEntries={LIMITS.certifications}
            debounceMs={0}
          />
          <TextArea
            label="Försäkringar"
            description="Upphandlingar kräver ofta en ansvarsförsäkring med ett lägsta belopp, till exempel 5 mnkr. Skriv beloppet."
            value={draft.insurance}
            onChange={(value) => onChange({ insurance: value })}
            rows={isPhone ? 3 : 2}
            maxLength={LIMITS.insurance}
            status={errors.insurance ? { type: "error", message: errors.insurance } : undefined}
          />
          <TextArea
            label="Tidigare uppdrag åt offentliga beställare"
            description="Beställare, år och ungefärligt värde. Upphandlingar kräver ofta referensuppdrag."
            value={draft.references}
            onChange={(value) => onChange({ references: value })}
            rows={isPhone ? 5 : 3}
            maxLength={LIMITS.references}
            status={errors.references ? { type: "error", message: errors.references } : undefined}
          />
        </FormLayout>
      </VStack>
    </Card>
  );
}
