import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate, useSearchParams } from "react-router";
import { useLogin, useSession } from "../api/queries";
import type { Role } from "../api/types";
import { Row, RowList } from "../components/RowList";
import { ErrorNotice, Loading } from "../components/states";
import { Page } from "../shell/Page";

const HOME: Record<Role, string> = { foretagare: "/bevakning", inkopare: "/inkop" };

/** Where to go after logging in: an internal path from `?till=`, never another site or the login itself. */
export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/logga-in")) return null;
  return value;
}

/** PoC-only persona picker. Production uses e-legitimation and a check that the user may represent the company. */
export default function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnPath = safeReturnPath(params.get("till"));

  const choose = (persona: Role) =>
    login.mutate(persona, { onSuccess: () => navigate(returnPath ?? HOME[persona]) });

  const user = session.data?.user;
  return (
    <Page
      title="Logga in"
      heading="Logga in (demo)"
      width={640}
      intro="Välj vem du vill vara i demonstrationen."
    >
      <Banner
        status="warning"
        title="Förenklad inloggning för demo"
        description="Här finns ingen riktig inloggning. I en färdig tjänst loggar företag in med e-legitimation, och det kontrolleras att personen får företräda företaget."
        collapsible={false}
      />
      {user && <Text>{`Du är inloggad som ${user.name}. Välj en roll för att byta.`}</Text>}
      {session.isPending && <Loading label="Hämtar roller …" />}
      {session.isError && (
        <ErrorNotice title="Rollerna kunde inte hämtas" error={session.error} onRetry={() => session.refetch()} />
      )}
      {session.isSuccess && (
        <RowList label="Roller">
          {session.data.personas.map((persona) => (
            <Row key={persona.key}>
              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={1}>
                  <Heading level={2}>{persona.label}</Heading>
                  <Text color="secondary">{persona.description}</Text>
                </VStack>
                <Button
                  label={`Logga in som ${persona.label}`}
                  variant="primary"
                  isLoading={login.isPending && login.variables === persona.key}
                  isDisabled={login.isPending}
                  onClick={() => choose(persona.key)}
                />
              </HStack>
            </Row>
          ))}
        </RowList>
      )}
      {login.isError && <ErrorNotice title="Inloggningen misslyckades" error={login.error} />}
    </Page>
  );
}
