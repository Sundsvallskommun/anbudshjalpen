import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ApiError } from "../api/client";

/** A spinner with words, for a region whose content is on its way. */
export function Loading({ label }: { label: string }) {
  return (
    <VStack padding={6} hAlign="center" role="status">
      <Spinner size="lg" label={label} />
    </VStack>
  );
}

/**
 * A line saying that something is going on behind what is shown ("Träffarna bedöms på nytt …"): a small spinner
 * beside supporting text, announced once as a status. For a region that already has content, unlike `Loading`.
 */
export function Working({ children }: { children: string }) {
  return (
    <HStack gap={2} vAlign="center" role="status">
      <Spinner size="sm" shade="subtle" aria-hidden />
      <Text type="supporting">{children}</Text>
    </HStack>
  );
}

/** The words for a failed request: the server's own (ApiError), or ones already written for the reader (a string). */
export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  return error instanceof ApiError ? error.message : "Något gick fel. Försök igen.";
}

/** A failed request: what failed, the reason, and a retry when one can help. */
export function ErrorNotice({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  return (
    <Banner
      status="error"
      title={title}
      description={errorMessage(error)}
      collapsible={false}
      endContent={onRetry ? <Button label="Försök igen" size="sm" onClick={onRetry} /> : undefined}
    />
  );
}
