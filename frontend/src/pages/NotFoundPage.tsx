import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Page } from "../shell/Page";

export default function NotFoundPage() {
  return (
    <Page title="Sidan finns inte" width={640} intro="Adressen kan vara felstavad, eller så har sidan flyttats.">
      <HStack>
        <Button label="Till upphandlingarna" variant="primary" href="/" />
      </HStack>
    </Page>
  );
}
