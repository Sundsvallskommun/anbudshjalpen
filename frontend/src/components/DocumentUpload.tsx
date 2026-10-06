import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import { useUploadDocument } from "../api/queries";
import { plural } from "../lib/format";
import { ErrorNotice } from "./states";
import { UploadIcon } from "./ui/icons";

/**
 * The buyer uploads a procurement document; the worker interprets it into a checklist draft. The button stays active
 * and the field says what is missing when it is pressed (direction.md, section 10).
 */
export function DocumentUpload({ noticeId }: { noticeId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useUploadDocument();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setProblem("Välj ett underlag att ladda upp.");
      return;
    }
    upload.mutate({ noticeId, file }, { onSuccess: () => setFile(null) });
  };

  return (
    <form onSubmit={onSubmit} aria-label="Ladda upp underlag" noValidate>
      <VStack gap={3} hAlign="start">
        <FileInput
          label="Förfrågningsunderlag"
          description="PDF, Word eller text. Underlaget tolkas till en checklista som du granskar innan den publiceras."
          value={file}
          onChange={(next) => {
            setFile(Array.isArray(next) ? (next[0] ?? null) : next);
            setProblem(null);
          }}
          accept=".pdf,.docx,.txt,.md"
          width="100%"
          status={problem ? { type: "error", message: problem } : undefined}
        />
        <Button type="submit" label="Ladda upp" icon={<Icon icon={UploadIcon} />} isLoading={upload.isPending} />
        {upload.isSuccess && (
          <HStack gap={1} vAlign="center" role="status">
            <Icon icon="success" color="success" size="sm" />
            <Text>
              {`${upload.data.filename} är uppladdat (${plural(upload.data.page_count, "sida", "sidor")}). Checklistan tas fram i bakgrunden och hamnar under Att granska i Inköp.`}
            </Text>
          </HStack>
        )}
        {upload.isError && <ErrorNotice title="Underlaget kunde inte laddas upp" error={upload.error} />}
      </VStack>
    </form>
  );
}
