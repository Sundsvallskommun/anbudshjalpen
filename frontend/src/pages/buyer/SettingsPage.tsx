import { Card } from "@astryxdesign/core/Card";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useAppSettings, useUpdateAppSettings } from "../../api/queries";
import type { AppSettingsSaved } from "../../api/types";
import { ErrorNotice, Loading } from "../../components/states";
import { plural } from "../../lib/format";
import { Page } from "../../shell/Page";
import { RequireRole } from "../../shell/RequireRole";

export const REVIEW_LABEL = "Inköp granskar checklistor innan de publiceras";
const REVIEW_DESCRIPTION =
  "På: företagen ser en checklista först när inköp har godkänt och publicerat den. " +
  "Av: en checklista publiceras direkt när den har tolkats, märkt ”inte granskad av inköp”, och de som väntar på " +
  "granskning publiceras nu.";

/** What the toast says after a save: how many waiting checklists the change published, if any. */
export function savedMessage(saved: AppSettingsSaved): string {
  if (saved.published_now === 0) return "Inställningen är sparad.";
  return `Inställningen är sparad. ${plural(saved.published_now, "checklista", "checklistor")} som väntade på granskning publicerades.`;
}

function SettingsContent() {
  const settings = useAppSettings();
  const update = useUpdateAppSettings();
  const showToast = useToast();
  if (settings.isPending) return <Loading label="Hämtar inställningarna …" />;
  if (settings.isError) {
    return (
      <ErrorNotice title="Inställningarna kunde inte hämtas" error={settings.error} onRetry={() => settings.refetch()} />
    );
  }
  const change = async (reviewRequired: boolean) => {
    const saved = await update.mutateAsync({ review_required: reviewRequired });
    showToast({ body: savedMessage(saved), uniqueID: "installning-sparad" });
  };
  return (
    <VStack gap={4}>
      <Card>
        <VStack gap={3}>
          <Switch
            label={REVIEW_LABEL}
            description={REVIEW_DESCRIPTION}
            value={settings.data.review_required}
            changeAction={change}
          />
          <Text type="supporting">
            Avvisade och tillbakadragna checklistor påverkas inte. Inköp kan alltid dra tillbaka en publicerad checklista.
          </Text>
        </VStack>
      </Card>
      {update.isError && <ErrorNotice title="Inställningen kunde inte sparas" error={update.error} />}
    </VStack>
  );
}

/**
 * Inställningar (decision 0011): the settings the business owns, each a switch with its explanation, saved at once.
 * Operators' settings (addresses, keys, what is on in an environment) stay in the environment.
 */
export default function SettingsPage() {
  return (
    <RequireRole role="inkopare" title="Inställningar">
      {() => (
        <Page title="Inställningar" width={640} intro="Så här arbetar Anbudshjälpen. Ändringar gäller direkt för alla.">
          <SettingsContent />
        </Page>
      )}
    </RequireRole>
  );
}
