import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useId } from "react";
import type { ProfileChangeItem, ProfileChatView } from "../../api/types";
import { ToolsUsed } from "../../components/ui/ToolsUsed";
import { engineLabel } from "../../lib/labels";

export const PROFILE_PENDING = "Läser profilen och tolkar meddelandet …";
const SAVED = "Sparat i profilen";
const NOTHING = "–";

/** "2 upphandlingar verkar passa er nu", after a change re-assessed the matches before the answer. */
export function fittingLine(count: number | null): string | null {
  if (count === null) return null;
  if (count === 0) return "Ingen öppen upphandling verkar passa er just nu.";
  return count === 1 ? "1 upphandling verkar passa er nu." : `${count} upphandlingar verkar passa er nu.`;
}

/** One changed part of the profile: its name, the words now and the words before. */
function Change({ item }: { item: ProfileChangeItem }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting" weight="semibold" color="primary">
        {item.label}
      </Text>
      <Text>{item.after ?? NOTHING}</Text>
      <Text type="supporting">{`Förut: ${item.before ?? NOTHING}`}</Text>
    </VStack>
  );
}

function Changes({ view }: { view: ProfileChatView }) {
  const labelId = useId();
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Token label={SAVED} color="green" size="sm" icon={<Icon icon="success" size="sm" />} />
        <Link href="/profil" size="sm" hasUnderline>
          Visa profilen
        </Link>
      </HStack>
      <Text type="supporting" id={labelId}>
        Det här ändrades
      </Text>
      <VStack as="ul" role="list" aria-labelledby={labelId} gap={2}>
        {view.changes.map((item) => (
          <li key={item.field}>
            <Change item={item} />
          </li>
        ))}
      </VStack>
      {fittingLine(view.fitting_notices) && <Text type="supporting">{fittingLine(view.fitting_notices)}</Text>}
    </VStack>
  );
}

function Pending() {
  return (
    <HStack gap={2} vAlign="center" role="status">
      <HStack aria-hidden="true">
        <Spinner size="sm" />
      </HStack>
      <Text color="secondary">{PROFILE_PENDING}</Text>
    </HStack>
  );
}

/**
 * What a message to the profile came to (decision 0025): the assistant's reply in bold, and when it changed the
 * profile the green "Sparat i profilen" with a link to the profile page and each changed part with its words now
 * and before, so the company sees exactly what the message did; a question back shows only the reply. Under it the
 * tools the app ran, as under every answer. The panel's thread names the article.
 */
export function ProfileChatCard({ view }: { view: ProfileChatView | null }) {
  return (
    <Card aria-busy={view === null ? true : undefined}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="supporting" weight="semibold" color="primary">
            Svar
          </Text>
          {view && <Text type="supporting">{engineLabel(view.engine)}</Text>}
        </HStack>
        {view ? (
          <>
            <Text as="p" weight="semibold">
              {view.reply}
            </Text>
            {view.applied && <Changes view={view} />}
            <ToolsUsed tools={view.tools} />
          </>
        ) : (
          <Pending />
        )}
      </VStack>
    </Card>
  );
}
