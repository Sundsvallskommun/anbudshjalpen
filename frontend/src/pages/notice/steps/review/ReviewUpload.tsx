import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FileInput } from "@astryxdesign/core/FileInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DocumentIcon, TrashIcon, UploadIcon } from "../../../../components/ui/icons";
import { formatBytes, plural } from "../../../../lib/format";

const ACCEPT = ".pdf,.docx,.txt,.md";
/** The backend's caps (`services.review`): the files together, and how many of them. */
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10;
/** After this long the card says the review takes longer than usual, so a slow model does not look like a hang. */
const SLOW_AFTER_MS = 45_000;

/** The draft's files in one line: "anbud.pdf, forsakringsbevis.pdf". */
function fileNamesText(fileNames: readonly string[]): string {
  return fileNames.join(", ");
}

/** The same file chosen twice is one file. */
function isSameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size;
}

/**
 * Where the draft is put together (direction.md, section 4 "Steg 3 Granska", and decision 0025): the tender and what
 * the company means to attach are collected in a list, each file can be dropped again, and "Granska utkastet" sends
 * them as one draft. The button stays active and the field says what is missing when it is pressed (direction.md,
 * section 10). The privacy rules stand at the field, where they can be read before a file leaves the device.
 */
export function ReviewUpload({
  onReview,
  takesFocus = false,
}: {
  onReview: (files: File[]) => void;
  /** Move the focus into the form when it opens ("Granska en ny version"). */
  takesFocus?: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (takesFocus) formRef.current?.querySelector<HTMLElement>("button, input:not([type=hidden])")?.focus();
  }, [takesFocus]);

  const add = (next: File | File[] | null) => {
    const added = next === null ? [] : Array.isArray(next) ? next : [next];
    const merged = [...files];
    for (const file of added) if (!merged.some((chosen) => isSameFile(chosen, file))) merged.push(file);
    if (merged.length > MAX_FILES) {
      setProblem(`Högst ${MAX_FILES} filer per granskning.`);
      return;
    }
    if (merged.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
      setProblem("Utkastet är för stort. Filerna får tillsammans vara högst 20 MB.");
      return;
    }
    setProblem(null);
    setFiles(merged);
  };

  const remove = (dropped: File) => {
    setFiles(files.filter((file) => file !== dropped));
    setProblem(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (files.length === 0) {
      setProblem("Välj anbudet, och det du tänker bifoga, innan du granskar.");
      return;
    }
    onReview(files);
  };

  return (
    <Card>
      <form ref={formRef} aria-label="Granska ett anbudsutkast" onSubmit={submit} noValidate>
        <VStack gap={4}>
          <FileInput
            label="Ditt anbudsutkast"
            description="Anbudet och det du tänker bifoga: PDF, Word eller text, tillsammans högst 20 MB. Lägg till filerna en i taget eller flera på en gång."
            placeholder="Släpp filerna här eller välj filer"
            value={null}
            onChange={add}
            accept={ACCEPT}
            isMultiple
            maxSize={MAX_BYTES}
            mode="dropzone"
            width="100%"
            status={problem ? { type: "error", message: problem } : undefined}
          />
          {files.length > 0 && (
            <VStack as="ul" role="list" aria-label="Valda filer" gap={2}>
              {files.map((file) => (
                <HStack as="li" key={`${file.name}-${file.size}`} gap={3} vAlign="center" hAlign="between">
                  <HStack gap={3} vAlign="center">
                    <Icon icon={DocumentIcon} size="md" color="secondary" />
                    <VStack gap={0.5}>
                      <Text weight="semibold">{file.name}</Text>
                      <Text type="supporting">{formatBytes(file.size)}</Text>
                    </VStack>
                  </HStack>
                  <IconButton label={`Ta bort ${file.name}`} icon={<Icon icon={TrashIcon} />} variant="ghost" size="sm" onClick={() => remove(file)} />
                </HStack>
              ))}
            </VStack>
          )}
          <VStack gap={1}>
            <HStack gap={2} vAlign="start">
              <Icon icon="info" size="sm" color="secondary" />
              <Text type="supporting">Utkastet sparas inte. Filerna läses, jämförs med kraven och raderas direkt.</Text>
            </HStack>
            <HStack gap={2} vAlign="start">
              <Icon icon="warning" size="sm" color="warning" />
              <Text type="supporting">Ladda inte upp riktiga anbud eller personuppgifter i demon.</Text>
            </HStack>
          </VStack>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Button type="submit" label="Granska utkastet" variant="primary" icon={<Icon icon={UploadIcon} />} />
            {files.length > 0 && <Text type="supporting">{plural(files.length, "fil vald", "filer valda")}</Text>}
          </HStack>
        </VStack>
      </form>
    </Card>
  );
}

/**
 * The review under way, in the place of the form: the files by name, a moving bar that says what is being done, and
 * how long it usually takes, so forty seconds with a model feel like work and not like a hang. A status region, so a
 * screen reader hears it start.
 */
export function ReviewInProgress({ fileNames, requirementCount }: { fileNames: readonly string[]; requirementCount: number }) {
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
            <Text weight="semibold">{fileNamesText(fileNames)}</Text>
            <Text type="supporting">Granskas nu · sparas inte</Text>
          </VStack>
        </HStack>
        <ProgressBar label={`Läser utkastet och jämför med ${plural(requirementCount, "krav", "krav")}`} isIndeterminate />
        <Text type="supporting">
          {isSlow
            ? "Det tar längre än vanligt, men granskningen pågår fortfarande."
            : "Tar oftast under en minut. Filerna raderas så fort granskningen är klar."}
        </Text>
      </VStack>
    </Card>
  );
}

/** The reviewed draft, once the form has folded away: its files, that they were not kept, and "Granska en ny version". */
export function ReviewedFile({ fileNames, onNewVersion }: { fileNames: readonly string[]; onNewVersion: () => void }) {
  return (
    <Card>
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={3} vAlign="center">
          <Icon icon={DocumentIcon} size="md" color="secondary" />
          <VStack gap={0.5}>
            <Text weight="semibold">{fileNamesText(fileNames)}</Text>
            <Text type="supporting">Granskat i dag · utkastet sparades inte</Text>
          </VStack>
        </HStack>
        <Button label="Granska en ny version" icon={<Icon icon={UploadIcon} />} onClick={onNewVersion} />
      </HStack>
    </Card>
  );
}
