import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useInterpretations, useInterpretDocument } from "../../api/queries";
import type { InterpretationState, InterpretationView } from "../../api/types";
import { ErrorNotice } from "../../components/states";
import { formatDateTime, plural } from "../../lib/format";

const STATE_LOOK: Record<InterpretationState, { label: string; color: "gray" | "yellow" | "red"; icon: "clock" | "warning" | "error" }> = {
  pending: { label: "Väntar på tolkning", color: "gray", icon: "clock" },
  retrying: { label: "Försöker igen", color: "yellow", icon: "warning" },
  failed: { label: "Tolkningen gav upp", color: "red", icon: "error" },
};

function InterpretationRow({ item }: { item: InterpretationView }) {
  const interpret = useInterpretDocument();
  const look = STATE_LOOK[item.state];
  const action = item.state === "pending" ? "Tolka nu" : "Tolka igen";
  const attempts =
    item.attempts > 0
      ? `${plural(item.attempts, "försök", "försök")}.${
          item.state === "retrying" && item.retry_at ? ` Nästa försök ${formatDateTime(item.retry_at)}.` : ""
        }`
      : null;
  return (
    <Item
      as="li"
      align="start"
      label={<Link href={`/upphandlingar/${item.notice_id}`}>{item.notice_title}</Link>}
      description={
        <VStack gap={1}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Token label={look.label} color={look.color} size="sm" icon={<Icon icon={look.icon} size="sm" />} />
            <Text type="supporting">{item.filename}</Text>
            {attempts && <Text type="supporting">{attempts}</Text>}
          </HStack>
          {item.error && <Text color="primary">{`Senaste fel: ${item.error}`}</Text>}
          {interpret.isSuccess && (
            <Text role="status">Tolkningen har startat. Checklistan hamnar i listan nedan när den är klar.</Text>
          )}
          {interpret.isError && <ErrorNotice title="Tolkningen kunde inte startas" error={interpret.error} />}
        </VStack>
      }
      endContent={
        <Button
          label={`${action}: ${item.filename}`}
          size="sm"
          isLoading={interpret.isPending}
          isDisabled={interpret.isSuccess}
          onClick={() => interpret.mutate(item.document_id)}
        >
          {action}
        </Button>
      }
    />
  );
}

/**
 * Documents without a checklist yet, above the queue (direction.md, section 4: "Underlag som inte kunde tolkas visas
 * som Banner överst"). A document the worker gave up on needs the buyer and is shown open; ones still being
 * interpreted are only mentioned, with the list behind a toggle.
 */
export function Interpretations() {
  const interpretations = useInterpretations();
  if (interpretations.isError) {
    return (
      <ErrorNotice
        title="Underlagen som väntar på tolkning kunde inte hämtas"
        error={interpretations.error}
        onRetry={() => interpretations.refetch()}
      />
    );
  }
  const items = interpretations.data ?? [];
  if (items.length === 0) return null;
  const failed = items.filter((item) => item.state === "failed").length;
  return (
    <Banner
      status={failed > 0 ? "warning" : "info"}
      title={
        failed > 0
          ? `${plural(failed, "underlag", "underlag")} kunde inte tolkas`
          : `${plural(items.length, "underlag", "underlag")} tolkas just nu`
      }
      description={
        failed > 0
          ? "Läs felet och tolka igen när orsaken är åtgärdad. Ett misslyckat försök görs annars om automatiskt några gånger."
          : "Checklistan hamnar i listan nedan när tolkningen är klar."
      }
      collapsible={failed === 0}
    >
      <VStack as="ul" role="list" gap={0} aria-label="Underlag utan checklista">
        {items.map((item) => (
          <InterpretationRow key={item.document_id} item={item} />
        ))}
      </VStack>
    </Banner>
  );
}
