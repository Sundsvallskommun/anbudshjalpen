import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { useSession } from "../api/queries";
import type { Role } from "../api/types";
import { homePath } from "../shell/navigation";
import { Page } from "../shell/Page";

/** The way back for each role, verb first (direction.md, section 7): to where that role starts (shell/navigation.ts). */
const HOME_LABEL: Record<Role | "visitor", string> = {
  foretagare: "Gå till Start",
  inkopare: "Gå till Inköp",
  visitor: "Gå till upphandlingarna",
};

/** An address that leads nowhere: say so plainly and offer the way to where the user starts. */
export default function NotFoundPage() {
  const session = useSession();
  const role = session.data?.user?.role ?? null;
  return (
    <Page title="Sidan finns inte" width={640} intro="Adressen kan vara felstavad, eller så har sidan flyttats.">
      <HStack>
        <Button label={HOME_LABEL[role ?? "visitor"]} variant="primary" href={homePath(role)} />
      </HStack>
    </Page>
  );
}
