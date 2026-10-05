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

/** The buyer uploads a procurement document; the worker interprets it into a checklist draft. */
export function DocumentUpload({ noticeId }: { noticeId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const upload = useUploadDocument();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (file) upload.mutate({ noticeId, file }, { onSuccess: () => setFile(null) });
  };

  return (
    <form onSubmit={onSubmit} aria-label="Ladda upp underlag">
      <VStack gap={3} hAlign="start">
        <FileInput
          label="Förfrågningsunderlag"
          description="PDF, Word eller text. Underlaget tolkas till en checklista som du granskar innan den publiceras."
          value={file}
          onChange={(next) => setFile(Array.isArray(next) ? (next[0] ?? null) : next)}
          accept=".pdf,.docx,.txt,.md"
          width="100%"
        />
        <Button type="submit" label="Ladda upp" isLoading={upload.isPending} isDisabled={!file} />
        {upload.isSuccess && (
          <HStack gap={1} vAlign="center" role="status">
            <Icon icon="success" color="success" size="sm" />
            <Text>
              {`${upload.data.filename} är uppladdat (${plural(upload.data.page_count, "sida", "sidor")}). Checklistan tas fram i bakgrunden och hamnar i granskningskön.`}
            </Text>
          </HStack>
        )}
        {upload.isError && <ErrorNotice title="Underlaget kunde inte laddas upp" error={upload.error} />}
      </VStack>
    </form>
  );
}
