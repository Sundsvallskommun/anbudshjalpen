import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useMatches } from "../../api/queries";
import type { CompanyView } from "../../api/types";
import { FictitiousToken } from "../../components/tokens";
import { fittingMatchCount, matchCountText } from "./profileDraft";

/**
 * The card at the top (direction.md, section 4 "Företagsprofil"): whose profile it is, what it decides, and how many
 * notices it finds right now, with the way to them. The count is the cards Start shows (those that seem to fit),
 * the same count as the toast after a save.
 */
export function ProfileSummary({ profile }: { profile: CompanyView }) {
  const matches = useMatches();
  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
          <VStack gap={0.5}>
            <Heading level={3} accessibilityLevel={2}>
              {profile.name}
            </Heading>
            {profile.org_number && <Text type="supporting">{`Org.nr ${profile.org_number}`}</Text>}
          </VStack>
          {profile.is_fictitious && <FictitiousToken />}
        </HStack>
        <Text as="p">Profilen styr vilka upphandlingar som visas på Start och om de märks ”Verkar passa”.</Text>
        {matches.isSuccess && (
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text weight="semibold">{matchCountText(fittingMatchCount(matches.data))}</Text>
            <Link href="/start" isStandalone>
              Se träffarna
            </Link>
          </HStack>
        )}
      </VStack>
    </Card>
  );
}
