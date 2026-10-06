import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { CollapsibleSection } from "../../../components/ui/CollapsibleSection";
import type { AutoCheck, CheckTarget } from "./checks";
import styles from "./ReviewRow.module.css";
import { ReviewRowList } from "./ReviewRow";

/** What a check's link is about, so every "Visa" and "Ändra" has its own name. */
const ACTION_OBJECT: Record<AutoCheck["id"], string> = {
  deadline: "sista anbudsdag",
  evaluation: "utvärderingskriterier",
  kinds: "krav vars typ inte stämmer med rubriken",
  sources: "källhänvisningar att kontrollera",
  summary: "sammanfattningen",
};

function CheckRow({ check, onAction }: { check: AutoCheck; onAction: (target: CheckTarget) => void }) {
  const isOk = check.tone === "ok";
  return (
    <Item
      as="li"
      className={`${styles.row} ${styles.compact}`}
      align="start"
      startContent={<Icon icon={isOk ? "success" : "warning"} color={isOk ? "success" : "warning"} size="sm" />}
      label={
        <Text>
          <VisuallyHidden>{isOk ? "Stämmer: " : "Att åtgärda: "}</VisuallyHidden>
          {check.text}
        </Text>
      }
      endContent={
        check.action ? (
          <Button
            label={`${check.action.label} ${ACTION_OBJECT[check.id]}`}
            size="sm"
            variant="ghost"
            onClick={() => check.action && onAction(check.action.target)}
          >
            {check.action.label}
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * "Automatiska kontroller" (direction.md, section 4): what the app checked in the list, each with a link to what to
 * fix. Open while something needs fixing.
 */
export function AutoChecks({ checks, onAction }: { checks: readonly AutoCheck[]; onAction: (target: CheckTarget) => void }) {
  if (checks.length === 0) return null;
  const toFix = checks.filter((check) => check.tone === "warning").length;
  const ok = checks.length - toFix;
  return (
    <CollapsibleSection
      id="kontroller"
      title="Automatiska kontroller"
      helper={`${toFix} att åtgärda · ${ok} stämmer`}
      defaultOpen={toFix > 0}
      headingLevel={2}
    >
      <ReviewRowList label="Automatiska kontroller">
        {checks.map((check) => (
          <CheckRow key={check.id} check={check} onAction={onAction} />
        ))}
      </ReviewRowList>
    </CollapsibleSection>
  );
}
