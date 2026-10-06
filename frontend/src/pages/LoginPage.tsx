import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useConfig, useLogin, useSession } from "../api/queries";
import type { Persona, Role } from "../api/types";
import { ErrorNotice, Loading } from "../components/states";
import { FALLBACK_DEMO_NOTICE } from "../shell/AboutDemo";
import { homePath } from "../shell/navigation";
import { Page } from "../shell/Page";
import { PersonaCard } from "./login/PersonaCard";
import { personaIdentity } from "./login/personas";

/** Where to go after logging in: an internal path from `?till=`, never another site or the login itself. */
export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/logga-in")) return null;
  return value;
}

/**
 * The demo notice in full, once, below the cards (direction.md: "Hela demotexten står i en muted Section under
 * korten"). The strip at the top has the one-line version and "Om demon och AI".
 */
function DemoNote({ notice }: { notice: string | undefined }) {
  return (
    <Card variant="muted">
      <Text as="p">{notice ?? FALLBACK_DEMO_NOTICE}</Text>
    </Card>
  );
}

/**
 * The PoC's persona picker (decision 0007; direction.md, section 4 "Logga in (demo)"): two role cards, and the
 * user lands on the role's start, or back on the page that asked for the login. Production uses e-legitimation and
 * a check that the person may represent the company.
 */
export default function LoginPage() {
  const session = useSession();
  const config = useConfig();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnPath = safeReturnPath(params.get("till"));
  const [chosen, setChosen] = useState<Persona | null>(null);

  const choose = (persona: Persona) => {
    if (login.isPending) return;
    setChosen(persona);
    login.mutate(persona.key, { onSuccess: () => navigate(returnPath ?? homePath(persona.key)) });
  };

  const organization = config.data?.organization_name;
  const currentRole: Role | null = session.data?.user?.role ?? null;
  const loggingIn = login.isPending && chosen ? personaIdentity(chosen, organization).name : null;
  return (
    <Page
      title="Logga in"
      heading="Välj vem du är i demon"
      width={760}
      intro="Ingen riktig inloggning. I tjänsten loggar företag in med e-legitimation."
    >
      {session.isPending && <Loading label="Hämtar rollerna …" />}
      {session.isError && (
        <ErrorNotice title="Rollerna kunde inte hämtas" error={session.error} onRetry={() => session.refetch()} />
      )}
      {session.isSuccess && session.data.personas.length === 0 && (
        <EmptyState headingLevel={2} title="Det finns inga roller att välja" description="Demodatan är inte inlagd ännu." />
      )}
      {session.isSuccess && session.data.personas.length > 0 && (
        <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
          {session.data.personas.map((persona) => (
            <PersonaCard
              key={persona.key}
              role={persona.key}
              identity={personaIdentity(persona, organization)}
              isCurrent={currentRole === persona.key}
              isLoggingIn={login.isPending && chosen?.key === persona.key}
              returnsToPage={returnPath !== null}
              onChoose={() => choose(persona)}
            />
          ))}
        </Grid>
      )}
      {login.isError && <ErrorNotice title="Inloggningen misslyckades" error={login.error} />}
      <DemoNote notice={config.data?.demo_notice} />
      <VisuallyHidden as="div" role="status">
        {loggingIn ? `Loggar in som ${loggingIn} …` : ""}
      </VisuallyHidden>
    </Page>
  );
}
