import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useSession } from "../api/queries";
import type { Role, UserView } from "../api/types";
import { ErrorNotice, Loading } from "../components/states";
import { Page } from "./Page";

const ROLE_NAMES: Record<Role, string> = { foretagare: "företagare", inkopare: "inköpare" };

/**
 * Shows a page only to the role it is for. Others get the page's heading and a way to log in, so the
 * address still says where they are. The backend enforces the same rule; this is for the reader.
 */
export function RequireRole({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: (user: UserView) => ReactNode;
}) {
  const session = useSession();
  const { pathname } = useLocation();

  if (session.isPending) return <Loading label="Hämtar inloggningen …" />;
  if (session.isError) {
    return (
      <Page title={title}>
        <ErrorNotice title="Inloggningen kunde inte hämtas" error={session.error} onRetry={() => session.refetch()} />
      </Page>
    );
  }
  const user = session.data.user;
  if (user?.role === role) return children(user);

  const loginHref = `/logga-in?till=${encodeURIComponent(pathname)}`;
  return (
    <Page title={title}>
      <EmptyState
        headingLevel={2}
        title={user ? `Sidan är för ${ROLE_NAMES[role]}` : "Logga in för att se sidan"}
        description={
          user
            ? `Du är inloggad som ${ROLE_NAMES[user.role]}. Logga in med en annan roll för att se sidan.`
            : `Sidan visar uppgifter för inloggade ${ROLE_NAMES[role]}.`
        }
        actions={<Button label="Logga in" variant="primary" href={loginHref} />}
      />
    </Page>
  );
}
