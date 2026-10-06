import { Avatar } from "@astryxdesign/core/Avatar";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { Role } from "../../api/types";
import { ArrowRightIcon } from "../../components/ui/icons";
import { ROLE_COPY, type PersonaIdentity } from "./personas";

export interface PersonaCardProps {
  role: Role;
  identity: PersonaIdentity;
  /** The persona the user is logged in as now. */
  isCurrent: boolean;
  /** This persona's login is on its way. */
  isLoggingIn: boolean;
  /** The login was asked for by a page (`?till=`), which the user goes back to. */
  returnsToPage: boolean;
  onChoose: () => void;
}

/**
 * One role as a card the whole of which can be pressed (direction.md, section 4 "Logga in (demo)"): the avatar's
 * initials, the name and organisation, the role, what it can do, where it lands, and "Fortsätt som Anna". The card's
 * own button carries the name, so the visible call to action is not a second control.
 */
export function PersonaCard({ role, identity, isCurrent, isLoggingIn, returnsToPage, onChoose }: PersonaCardProps) {
  const copy = ROLE_COPY[role];
  const action = `Fortsätt som ${identity.firstName}`;
  return (
    <ClickableCard label={`${action}, ${copy.title.toLocaleLowerCase("sv")}`} onClick={onChoose} height="100%">
      <VStack gap={5} vAlign="between" height="100%">
        <VStack gap={4}>
          <HStack gap={3} vAlign="center">
            <Avatar name={identity.name} size="lg" tooltip={false} aria-hidden="true" />
            <VStack gap={0.5}>
              <Heading level={3} accessibilityLevel={2}>
                {identity.name}
              </Heading>
              {identity.organization && <Text type="supporting">{identity.organization}</Text>}
            </VStack>
          </HStack>
          <HStack gap={2} wrap="wrap">
            <Token label={copy.title} color="gray" size="sm" />
            {isCurrent && <Token label="Inloggad nu" color="green" size="sm" icon={<Icon icon="success" size="sm" />} />}
          </HStack>
          <VStack as="ul" role="list" gap={2}>
            {copy.abilities.map((ability) => (
              <HStack as="li" key={ability} gap={2} vAlign="start">
                {/* The tick is centred on the first line of text, as on Start's reason lines. */}
                <HStack height={24} vAlign="center">
                  <Icon icon="check" color="success" size="sm" />
                </HStack>
                <Text>{ability}</Text>
              </HStack>
            ))}
          </VStack>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting">
            {returnsToPage ? "Du kommer tillbaka till sidan du var på." : `Du kommer till: ${copy.destination}`}
          </Text>
          <HStack gap={1} vAlign="center" aria-hidden="true">
            {isLoggingIn && <Spinner size="sm" />}
            <Text weight="semibold" color="accent">
              {isLoggingIn ? "Loggar in …" : action}
            </Text>
            {!isLoggingIn && <Icon icon={ArrowRightIcon} size="sm" color="accent" />}
          </HStack>
        </VStack>
      </VStack>
    </ClickableCard>
  );
}
