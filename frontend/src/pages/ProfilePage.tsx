import { VStack } from "@astryxdesign/core/VStack";
import { useProfile, useSession } from "../api/queries";
import { ErrorNotice, Loading } from "../components/states";
import { Page } from "../shell/Page";
import { RequireRole } from "../shell/RequireRole";
import { LabBanner } from "./profile/LabBanner";
import { ProfileForm } from "./profile/ProfileForm";
import { ProfileSummary } from "./profile/ProfileSummary";

function ProfileContent() {
  const profile = useProfile();
  const lab = useSession().data?.user?.lab ?? null;
  if (profile.isPending) return <Loading label="Hämtar profilen …" />;
  if (profile.isError) {
    return <ErrorNotice title="Profilen kunde inte hämtas" error={profile.error} onRetry={() => profile.refetch()} />;
  }
  return (
    <VStack gap={6}>
      {lab && <LabBanner lab={lab} />}
      <ProfileSummary profile={profile.data} />
      <ProfileForm profile={profile.data} />
    </VStack>
  );
}

/**
 * Företagsprofil (direction.md, section 4): the company in plain language. What it does is said in its own words and
 * as CPV codes named first, which Anbudsklar can suggest; the facts requirements usually ask about follow. The
 * profile decides which notices Start shows and which are marked "Verkar passa". A form, so the form width (640).
 */
export default function ProfilePage() {
  return (
    <RequireRole role="foretagare" title="Företagsprofil">
      {() => (
        <Page
          title="Företagsprofil"
          width={640}
          intro="Beskriv företaget en gång, så hittar Anbudsklar upphandlingar som passar er och jämför er med kraven."
        >
          <ProfileContent />
        </Page>
      )}
    </RequireRole>
  );
}
