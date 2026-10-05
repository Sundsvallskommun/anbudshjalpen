import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useConfig } from "../../api/queries";
import type { Checklist, NoticeDetail } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { procurementLink, submissionLink } from "../../lib/links";

interface CheckItem {
  value: string;
  label: string;
  description?: string;
}

/** The final check before submitting: every skallkrav, every attachment and the deadline. */
export function submissionItems(checklist: Checklist, deadline: string | null): CheckItem[] {
  const requirements = checklist.requirements
    .filter((requirement) => requirement.kind === "skallkrav" || requirement.kind === "kvalificeringskrav")
    .map((requirement, index) => ({
      value: `krav-${index}`,
      label: requirement.title,
      description: requirement.evidence ?? undefined,
    }));
  const attachments = checklist.attachments.map((attachment, index) => ({
    value: `bilaga-${index}`,
    label: `Bifogat: ${attachment.name}`,
    description: attachment.description ?? undefined,
  }));
  return [
    ...requirements,
    ...attachments,
    {
      value: "inlamning",
      label: deadline
        ? `Anbudet lämnas i e-Avrop senast ${formatDateTime(deadline)}`
        : "Anbudet lämnas i e-Avrop före sista anbudsdag",
      description: "Anbud som kommer in för sent får inte prövas.",
    },
  ];
}

/** Journey step 7: submission happens in e-Avrop; this is the last check. Nothing here is stored. */
export function SubmissionTab({ notice }: { notice: NoticeDetail }) {
  const [checked, setChecked] = useState<string[]>([]);
  const config = useConfig();
  const checklist = notice.checklist?.status === "published" ? notice.checklist.checklist : null;

  if (!checklist) {
    return (
      <EmptyState
        headingLevel={2}
        title="Sista kontrollen kommer med checklistan"
        description="När inköp har publicerat checklistan visas en lista att gå igenom innan du lämnar anbudet."
      />
    );
  }

  const items = submissionItems(checklist, notice.deadline_at);
  const link = submissionLink(notice, config.data?.eavrop_url);
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>Inför inlämning</Heading>
        <Text color="secondary">
          Anbudet lämnas i e-Avrop. Gå igenom listan innan du skickar det. Bockarna sparas inte, de är bara ett stöd
          för dig.
        </Text>
      </VStack>
      <ProgressBar
        label="Klart inför inlämning"
        value={checked.length}
        max={items.length}
        hasValueLabel
        formatValueLabel={(value, max) => `${value} av ${max}`}
        variant={checked.length === items.length ? "success" : "accent"}
      />
      <CheckboxList label="Sista kontroll" value={checked} onChange={setChecked} hasDividers>
        {items.map((item) => (
          <CheckboxListItem key={item.value} value={item.value} label={item.label} description={item.description} />
        ))}
      </CheckboxList>
      {link && (
        <Link href={link.href} isExternalLink isStandalone>
          {link.text}
        </Link>
      )}
      {notice.is_fictitious && !procurementLink(notice) && (
        <Text color="secondary">Den här upphandlingen är påhittad för demon och finns därför inte i e-Avrop.</Text>
      )}
    </VStack>
  );
}
