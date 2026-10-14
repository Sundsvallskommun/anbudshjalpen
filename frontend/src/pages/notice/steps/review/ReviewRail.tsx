import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { CheckStatus } from "../../../../api/types";
import { StatusToken } from "../../../../components/tokens";

const LEGEND: { status: CheckStatus; meaning: string }[] = [
  { status: "saknas", meaning: "Granskningen hittade inget i utkastet som svarar mot kravet." },
  { status: "obevisat", meaning: "Utkastet nämner kravet, men granskningen hittade inte beviset." },
  { status: "oklart", meaning: "Utkastet nämner delvis samma sak." },
  { status: "uppfyllt", meaning: "Utkastet svarar mot kravet." },
];

/** That the draft is not kept, in the upload form's words: it stays in view once the form has folded away. */
function NotKept() {
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <Icon icon="info" color="secondary" size="md" />
          <Heading level={3} accessibilityLevel={2}>
            Utkastet sparas inte
          </Heading>
        </HStack>
        <Text>Filen läses, jämförs med kraven och raderas direkt. Varken filen eller texten sparas.</Text>
        <Text type="supporting">Ladda inte upp riktiga anbud eller personuppgifter i demon.</Text>
      </VStack>
    </Card>
  );
}

/** What each status word means, so the result reads without guessing. */
function Legend() {
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={3} accessibilityLevel={2}>
          Så läser du resultatet
        </Heading>
        <VStack as="dl" gap={3}>
          {LEGEND.map(({ status, meaning }) => (
            <VStack key={status} gap={1} hAlign="start">
              <dt>
                <StatusToken status={status} size="sm" />
              </dt>
              <dd>
                <Text type="supporting">{meaning}</Text>
              </dd>
            </VStack>
          ))}
        </VStack>
        <Text type="supporting">Granskningen görs av AI och kan ha fel. Den är ett stöd och ersätter inte din egen läsning. Det är underlaget som gäller.</Text>
      </VStack>
    </Card>
  );
}

/**
 * Step 3's rail (direction.md, section 2 "Högerspalten"): integrity and the legend. While the upload form is open it
 * says at the field that the draft is not kept, so the rail does not say it again (`showsNotKept` false).
 */
export function ReviewRail({ showsNotKept = true }: { showsNotKept?: boolean }) {
  return (
    <>
      {showsNotKept && <NotKept />}
      <Legend />
    </>
  );
}
