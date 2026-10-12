import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FileInput } from "@astryxdesign/core/FileInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState } from "react";
import { DocumentIcon, UploadIcon } from "../../../../components/ui/icons";
import { plural } from "../../../../lib/format";

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 20 * 1024 * 1024;
/** After this long the card says the review takes longer than usual, so a slow model does not look like a hang. */
const SLOW_AFTER_MS = 45_000;

/**
 * Where the draft is chosen (direction.md, section 4 "Steg 3 Granska"): dropping or choosing the file starts the
 * review at once, so there is one thing to do, not a file to pick and then a button to find. The privacy rules stand
 * at the field, where they can be read before the file leaves the device.
 */
export function ReviewUpload({
  onReview,
  takesFocus = false,
}: {
  onReview: (file: File) => void;
  /** Move the focus into the form when it opens ("Granska en ny version"). */
  takesFocus?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (takesFocus) formRef.current?.querySelector<HTMLElement>("button, input:not([type=hidden])")?.focus();
  }, [takesFocus]);

  const choose = (next: File | File[] | null) => {
    const file = Array.isArray(next) ? (next[0] ?? null) : next;
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setProblem("Utkastet är för stort. Den största tillåtna storleken är 20 MB.");
      return;
    }
    setProblem(null);
    onReview(file);
  };

  return (
    <Card>
      <form ref={formRef} aria-label="Granska ett anbudsutkast" onSubmit={(event) => event.preventDefault()} noValidate>
        <VStack gap={4}>
          <FileInput
            label="Ditt anbudsutkast"
            description="PDF, Word eller text, högst 20 MB. Granskningen börjar så fort filen är vald."
            placeholder="Släpp filen här eller välj fil"
            value={null}
            onChange={choose}
            accept={ACCEPT}
            maxSize={MAX_BYTES}
            mode="dropzone"
            width="100%"
            status={problem ? { type: "error", message: problem } : undefined}
          />
          <VStack gap={1}>
            <HStack gap={2} vAlign="start">
              <Icon icon="info" size="sm" color="secondary" />
              <Text type="supporting">Utkastet sparas inte. Filen läses, jämförs med kraven och raderas direkt.</Text>
            </HStack>
            <HStack gap={2} vAlign="start">
              <Icon icon="warning" size="sm" color="warning" />
              <Text type="supporting">Ladda inte upp riktiga anbud eller personuppgifter i demon.</Text>
            </HStack>
          </VStack>
        </VStack>
      </form>
    </Card>
  );
}

/**
 * The review under way, in the place of the field: the file by name, a moving bar that says what is being done, and
 * how long it usually takes, so forty seconds with a model feel like work and not like a hang. A status region, so a
 * screen reader hears it start.
 */
export function ReviewInProgress({ fileName, requirementCount }: { fileName: string; requirementCount: number }) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Card>
      <VStack gap={4} role="status" aria-live="polite" aria-label="Granskningen pågår">
        <HStack gap={3} vAlign="center">
          <Icon icon={DocumentIcon} size="md" color="secondary" />
          <VStack gap={0.5}>
            <Text weight="semibold">{fileName}</Text>
            <Text type="supporting">Granskas nu · sparas inte</Text>
          </VStack>
        </HStack>
        <ProgressBar label={`Läser utkastet och jämför med ${plural(requirementCount, "krav", "krav")}`} isIndeterminate />
        <Text type="supporting">
          {isSlow
            ? "Det tar längre än vanligt, men granskningen pågår fortfarande."
            : "Tar oftast under en minut. Filen raderas så fort granskningen är klar."}
        </Text>
      </VStack>
    </Card>
  );
}

/** The reviewed draft, once the form has folded away: its name, that it was not kept, and "Granska en ny version". */
export function ReviewedFile({ fileName, onNewVersion }: { fileName: string; onNewVersion: () => void }) {
  return (
    <Card>
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={3} vAlign="center">
          <Icon icon={DocumentIcon} size="md" color="secondary" />
          <VStack gap={0.5}>
            <Text weight="semibold">{fileName}</Text>
            <Text type="supporting">Granskat i dag · utkastet sparades inte</Text>
          </VStack>
        </HStack>
        <Button label="Granska en ny version" icon={<Icon icon={UploadIcon} />} onClick={onNewVersion} />
      </HStack>
    </Card>
  );
}
