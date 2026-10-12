import { Avatar } from "@astryxdesign/core/Avatar";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { LabCompanyRef } from "../../api/types";
import { ArrowRightIcon } from "../../components/ui/icons";

/**
 * A lab company on the login page (decision 0010), in the persona cards' shape: the name, that it is a test
 * company from the workshop, and "Fortsätt som <företaget>". Whoever is behind the access code may continue as
 * any of them; the profiles hold nothing personal.
 */
export function LabCompanyCard({
  company,
  isCurrent,
  isLoggingIn,
  onChoose,
}: {
  company: LabCompanyRef;
  isCurrent: boolean;
  isLoggingIn: boolean;
  onChoose: () => void;
}) {
  const action = `Fortsätt som ${company.name}`;
  return (
    <ClickableCard label={action} onClick={onChoose} height="100%">
      <VStack gap={4} vAlign="between" height="100%">
        <HStack gap={3} vAlign="center">
          <Avatar name={company.name} size="lg" tooltip={false} aria-hidden="true" />
          <VStack gap={0.5}>
            <Heading level={3} accessibilityLevel={3}>
              {company.name}
            </Heading>
            <Text type="supporting">Testföretag från träffen</Text>
          </VStack>
        </HStack>
        <HStack gap={2} vAlign="center" hAlign="between">
          <HStack gap={2} vAlign="center">
            <Text weight="semibold" color="accent">
              {action}
            </Text>
            {isLoggingIn ? <Spinner size="sm" /> : <Icon icon={ArrowRightIcon} size="sm" aria-hidden="true" />}
          </HStack>
          {isCurrent && <Token label="Inloggad nu" />}
        </HStack>
      </VStack>
    </ClickableCard>
  );
}
