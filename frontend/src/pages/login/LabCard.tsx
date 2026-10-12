import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useCreateLabCompany } from "../../api/queries";
import { ErrorNotice } from "../../components/states";

/** Said wherever a lab company is created or shown: the lab holds a company's own words, nothing else. */
export const LAB_WARNING = "Skriv inga personuppgifter och inget som är hemligt. Testföretaget raderas efter 30 dagar.";

/**
 * Lab mode (decision 0010): a workshop participant creates a company of their own (the service's access code has
 * already let them in). Only a name is asked for here; what the company does is written on the profile page, which
 * the participant lands on.
 */
export function LabCard({ onCreated }: { onCreated: () => void }) {
  const create = useCreateLabCompany();
  const [name, setName] = useState("");
  const ready = name.trim().length >= 2;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || create.isPending) return;
    create.mutate({ name: name.trim() }, { onSuccess: onCreated });
  };

  return (
    <Card>
      <form aria-label="Prova med ditt eget företag" onSubmit={submit}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3} accessibilityLevel={2}>
              Prova med ditt eget företag
            </Heading>
            <Text color="secondary">
              Beskriv vad ni gör, så ser du vilka upphandlingar som verkar passa er. {LAB_WARNING}
            </Text>
          </VStack>
          <FormLayout>
            <TextInput
              label="Företagets namn"
              value={name}
              onChange={setName}
              autoComplete="organization"
              isRequired
            />
          </FormLayout>
          {create.isError && <ErrorNotice title="Testföretaget kunde inte skapas" error={create.error} />}
          <HStack>
            <Button
              label="Skapa testföretag"
              type="submit"
              variant="primary"
              isLoading={create.isPending}
              isDisabled={!ready}
            />
          </HStack>
        </VStack>
      </form>
    </Card>
  );
}
