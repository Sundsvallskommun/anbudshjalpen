import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import type { RequiredAttachment } from "../../api/types";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { DocumentIcon } from "../ui/icons";
import { SourceLink } from "../ui/source/SourceLink";
import { attachmentGroups, namePreview, type AttachmentItem } from "./checklistModel";
import { SectionRow, SectionRows, SectionSubheading } from "./SectionRow";

/** The anchor of the attachments section, for the statistic tile and the outline. */
export const ATTACHMENTS_ID = "bilagor";
export const ATTACHMENTS_TITLE = "Bilagor att lämna in";

function AttachmentRow({ item, noticeId, documentId }: { item: AttachmentItem; noticeId: string; documentId?: string }) {
  return (
    <SectionRow
      startContent={<Icon icon={DocumentIcon} size="md" color="secondary" />}
      label={
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text>{item.name}</Text>
          {item.number && <Text type="supporting">{item.number}</Text>}
        </HStack>
      }
      description={item.description ?? undefined}
      source={
        <SourceLink
          noticeId={noticeId}
          citation={item.citation}
          claim={item.name}
          origin={ATTACHMENTS_TITLE}
          documentId={documentId}
        />
      }
    />
  );
}

/** The closed section's line: the attachments by name, and how many more are needed only in some cases. */
function preview(required: readonly AttachmentItem[], conditional: readonly AttachmentItem[]): string {
  const names = namePreview(required.map((item) => item.name));
  const more = conditional.length > 0 ? `Och ${conditional.length} till som bara behövs i vissa fall.` : "";
  return [names, more].filter(Boolean).join(" ");
}

/**
 * The attachments to hand in with the tender, once each (the extraction often names one twice), and apart from them
 * the ones needed only in some cases: "Bilagor att lämna in, 5 bilagor" with "Bara i vissa fall (2)" at the end.
 * Closed from the start, with their names under the heading, so step 1 stays short (direction.md, section 11).
 */
export function Attachments({
  attachments,
  noticeId,
  documentId,
  defaultOpen = false,
}: {
  attachments: readonly RequiredAttachment[];
  noticeId: string;
  documentId?: string;
  defaultOpen?: boolean;
}) {
  if (attachments.length === 0) return null;
  const { required, conditional } = attachmentGroups(attachments);
  return (
    <CollapsibleSection
      id={ATTACHMENTS_ID}
      title={ATTACHMENTS_TITLE}
      count={required.length}
      countNoun={["bilaga", "bilagor"]}
      helper={preview(required, conditional)}
      defaultOpen={defaultOpen}
      value={ATTACHMENTS_ID}
    >
      {required.length > 0 && (
        <SectionRows>
          {required.map((item) => (
            <AttachmentRow key={item.key} item={item} noticeId={noticeId} documentId={documentId} />
          ))}
        </SectionRows>
      )}
      {conditional.length > 0 && (
        <>
          <SectionSubheading>{`Bara i vissa fall (${conditional.length})`}</SectionSubheading>
          <SectionRows>
            {conditional.map((item) => (
              <AttachmentRow key={item.key} item={item} noticeId={noticeId} documentId={documentId} />
            ))}
          </SectionRows>
        </>
      )}
    </CollapsibleSection>
  );
}
