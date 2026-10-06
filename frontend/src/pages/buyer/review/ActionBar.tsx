import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import type { ChecklistView } from "../../../api/types";
import { errorMessage } from "../../../components/states";
import { formatClock, formatShortDate } from "../../../lib/format";
import styles from "./ActionBar.module.css";
import { isWithdrawn } from "./ReviewHeader";
import type { SaveState } from "./useAutosave";

/** "5 okt 2026 kl. 10:05". */
function when(iso: string): string {
  const clock = formatClock(iso);
  const date = formatShortDate(iso, "always");
  return clock ? `${date} ${clock}` : date;
}

function SaveStatus({ state, error, onRetry }: { state: SaveState; error: unknown; onRetry: () => void }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap" role="status">
      {state === "saving" && (
        <>
          <Spinner size="sm" label="Sparar" />
          <Text type="supporting">Sparar …</Text>
        </>
      )}
      {state === "saved" && (
        <>
          <Icon icon="success" color="success" size="sm" />
          <Text type="supporting">Alla ändringar sparade</Text>
        </>
      )}
      {state === "failed" && (
        <>
          <Icon icon="error" color="error" size="sm" />
          <Text type="supporting" color="primary">{`Ändringen kunde inte sparas. ${errorMessage(error)}`}</Text>
          <Button label="Försök igen" size="sm" onClick={onRetry} />
        </>
      )}
    </HStack>
  );
}

export interface ActionBarProps {
  view: Pick<ChecklistView, "status" | "approved_at" | "published_at">;
  checked: number;
  total: number;
  saveState: SaveState;
  saveError: unknown;
  onRetrySave: () => void;
  onPublish: () => void;
  onApproveOnly: () => void;
  onReject: () => void;
  onWithdraw: () => void;
  onReinterpret: () => void;
}

/** What the bar says about where the checklist stands, beside the decision. */
function StateSummary(props: ActionBarProps) {
  const { view } = props;
  if (view.status === "published") {
    return (
      <Text>{`Publicerad${view.published_at ? ` ${when(view.published_at)}` : ""}. Företagen ser checklistan.`}</Text>
    );
  }
  if (view.status === "rejected") {
    return (
      <Text>
        {isWithdrawn(view)
          ? "Tillbakadragen. Företagen ser den inte längre."
          : "Avvisad. Den publiceras inte."}
      </Text>
    );
  }
  return (
    <VStack gap={1}>
      <HStack gap={6} vAlign="center" wrap="wrap">
        <VStack className={styles.progress}>
          <ProgressBar
            label={`Kontrollerat ${props.checked} av ${props.total}`}
            value={props.checked}
            max={Math.max(props.total, 1)}
            variant={props.total > 0 && props.checked === props.total ? "success" : "accent"}
          />
        </VStack>
        <SaveStatus state={props.saveState} error={props.saveError} onRetry={props.onRetrySave} />
      </HStack>
      {view.status === "approved" && (
        <Text type="supporting">
          {`Godkänd${view.approved_at ? ` ${when(view.approved_at)}` : ""}, inte publicerad. Ändrar du något blir den ett utkast igen.`}
        </Text>
      )}
    </VStack>
  );
}

/**
 * The decision, last (direction.md, section 4): one primary button, "Godkänn och publicera" for a draft (or
 * "Publicera" once approved), "Avvisa…" beside it and the rest under "Fler val". A published checklist can be
 * withdrawn; approval is offered for a draft only.
 */
export function ActionBar(props: ActionBarProps) {
  const { view } = props;
  const reinterpret: DropdownMenuOption = { label: "Tolka underlaget igen", onClick: props.onReinterpret };
  const more: DropdownMenuOption[] =
    view.status === "draft" ? [{ label: "Godkänn utan att publicera", onClick: props.onApproveOnly }, reinterpret] : [reinterpret];
  const canDecide = view.status === "draft" || view.status === "approved";
  return (
    <HStack as="section" aria-label="Beslut om checklistan" gap={4} vAlign="center" hAlign="between" wrap="wrap" className={styles.bar}>
      <VStack gap={1} className={styles.state}>
        <StateSummary {...props} />
      </VStack>
      <HStack gap={2} vAlign="center" wrap="wrap">
        {canDecide && <Button label="Avvisa…" variant="ghost" onClick={props.onReject} />}
        <MoreMenu label="Fler val" items={more} placement="above" alignment="end" />
        {view.status === "published" && <Button label="Dra tillbaka…" onClick={props.onWithdraw} />}
        {canDecide && (
          <Button
            label={view.status === "draft" ? "Godkänn och publicera" : "Publicera"}
            variant="primary"
            size="lg"
            onClick={props.onPublish}
          />
        )}
      </HStack>
    </HStack>
  );
}
