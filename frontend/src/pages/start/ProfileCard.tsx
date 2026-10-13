import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useProfile } from "../../api/queries";
import type { CompanyView } from "../../api/types";
import { ErrorNotice, Loading } from "../../components/states";
import { keepNumbersTogether } from "../../lib/text";
import { CardHeading } from "./CardHeading";
import styles from "./ProfileCard.module.css";

/** A field the company has not filled in says so, quietly. Long free text is cut off; the profile has it all. */
function Value({ text, maxLines }: { text: string | null; maxLines?: number }) {
  if (!text) return <Text color="secondary">Inte angivet</Text>;
  return <Text maxLines={maxLines}>{keepNumbersTogether(text)}</Text>;
}

/** What the company does, by name: CPV codes are shown by their labels only (direction.md, section 1.8). */
export function activityLabels(profile: Pick<CompanyView, "cpv_codes" | "cpv_labels">): string[] {
  return profile.cpv_codes
    .map((code) => profile.cpv_labels[code])
    .filter((label): label is string => Boolean(label));
}

/**
 * "Träffarna bygger på er profil" (direction.md, section 4 "Start"): the parts of the profile that decide the
 * matches, and the way to change them.
 */
export function ProfileCard() {
  const profile = useProfile();
  const labels = profile.data ? activityLabels(profile.data) : [];
  return (
    <Card>
      <VStack as="section" aria-labelledby="profil-kort" gap={4}>
        <CardHeading id="profil-kort">Träffarna bygger på er profil</CardHeading>
        {profile.isPending && <Loading label="Hämtar profilen …" />}
        {profile.isError && (
          <ErrorNotice title="Profilen kunde inte hämtas" error={profile.error} onRetry={() => profile.refetch()} />
        )}
        {profile.data && (
          <MetadataList label={{ position: "top" }} className={styles.list}>
            <MetadataListItem label="Vad ni gör">
              {labels.length > 0 ? (
                <HStack gap={1.5} wrap="wrap">
                  {labels.map((label) => (
                    <Token key={label} label={label} size="sm" color="gray" />
                  ))}
                </HStack>
              ) : (
                <Value text={null} />
              )}
            </MetadataListItem>
            <MetadataListItem label="Var">
              <Value text={profile.data.municipalities.join(", ") || null} />
            </MetadataListItem>
            <MetadataListItem label="Försäkring">
              <Value text={profile.data.insurance} maxLines={2} />
            </MetadataListItem>
            <MetadataListItem label="Offentliga uppdrag">
              <Value text={profile.data.public_references} maxLines={2} />
            </MetadataListItem>
          </MetadataList>
        )}
        <HStack>
          <Button label="Ändra profil" href="/profil" size="sm" />
        </HStack>
      </VStack>
    </Card>
  );
}
