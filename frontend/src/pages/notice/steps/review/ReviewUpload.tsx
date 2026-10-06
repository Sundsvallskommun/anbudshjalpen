import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FileInput } from "@astryxdesign/core/FileInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DocumentIcon, UploadIcon } from "../../../../components/ui/icons";

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Where the draft is chosen (direction.md, section 4 "Steg 3 Granska"): the privacy rules stand at the field, where they
 * can be followed. The button stays active and says what is missing when pressed.
 */
export function ReviewUpload({
  onReview,
  isReviewing,
  takesFocus = false,
}: {
  onReview: (file: File) => void;
  isReviewing: boolean;
  /** Move the focus into the form when it opens ("Granska en ny version"). */
  takesFocus?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (takesFocus) formRef.current?.querySelector<HTMLElement>("button, input:not([type=hidden])")?.focus();
  }, [takesFocus]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setProblem("Välj ditt anbudsutkast först.");
      return;
    }
    onReview(file);
  };

  return (
    <Card>
      <form ref={formRef} onSubmit={submit} aria-label="Granska ett anbudsutkast" noValidate>
        <VStack gap={4}>
          <FileInput
            label="Ditt anbudsutkast"
            description="PDF, Word eller text, högst 20 MB."
            value={file}
            onChange={(next) => {
              setFile(Array.isArray(next) ? (next[0] ?? null) : next);
              setProblem(null);
            }}
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
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Button type="submit" label="Granska utkastet" variant="primary" isLoading={isReviewing} />
            {isReviewing && <Text color="secondary">Läser utkastet och jämför med kraven …</Text>}
          </HStack>
        </VStack>
      </form>
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
