import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useEnterGate } from "../api/queries";
import { ErrorNotice } from "../components/states";
import { Page } from "../shell/Page";

/**
 * The service's own door (decision 0010): with ACCESS_CODE set, nothing else is shown until the visitor has typed
 * the code once. The code is kept in a cookie, so a phone or laptop asks only once in thirty days.
 */
export default function GatePage() {
  const enter = useEnterGate();
  const [code, setCode] = useState("");
  const ready = code.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || enter.isPending) return;
    enter.mutate(code.trim());
  };

  return (
    <Page title="Accesskod" heading="Ange accesskoden" width={640} intro="Anbudshjälpen är en testmiljö som bara är öppen för inbjudna.">
      <Card>
        <form aria-label="Accesskod" onSubmit={submit}>
          <VStack gap={4}>
            <FormLayout>
              <TextInput
                label="Accesskod"
                value={code}
                onChange={setCode}
                description="Koden får du av den som bjudit in dig."
                autoComplete="off"
                hasAutoFocus
                isRequired
              />
            </FormLayout>
            {enter.isError && <ErrorNotice title="Koden släppte inte in dig" error={enter.error} />}
            <HStack>
              <Button label="Fortsätt" type="submit" variant="primary" isLoading={enter.isPending} isDisabled={!ready} />
            </HStack>
            <Text type="supporting">Ingen riktig inloggning: koden är en enkel spärr för testmiljön.</Text>
          </VStack>
        </form>
      </Card>
    </Page>
  );
}
