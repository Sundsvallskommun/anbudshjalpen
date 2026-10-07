import { Card } from "@astryxdesign/core/Card";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { documentFileUrl } from "../../../api/queries";
import type { Checklist, ChecklistStatus, ChecklistView, DocumentInfo, NoticeDetail } from "../../../api/types";
import { DeadlineBlock } from "../../../components/ui/DeadlineBlock";
import { formatClock, formatNumber, formatShortDate, plural } from "../../../lib/format";
import { keyDateIndex } from "../../../lib/keyDates";
import { engineLabel, noticeDeadlineLabel } from "../../../lib/labels";
import { useIsPhone } from "../../../lib/usePhone";
import styles from "./ReviewHeader.module.css";
import { WIDE_QUERY } from "./Workbench";

const STEPS = ["Utkast", "Godkänd", "Publicerad"] as const;
const ACTIVE_STEP: Record<Exclude<ChecklistStatus, "rejected" | "none">, number> = {
  draft: 0,
  approved: 1,
  published: 2,
};

/** A withdrawn checklist is a rejected one that had been published: the backend keeps its publication date. */
export function isWithdrawn(view: Pick<ChecklistView, "status" | "published_at">): boolean {
  return view.status === "rejected" && view.published_at !== null;
}

/**
 * Where the checklist is in inköp's review, as a Stepper: Utkast → Godkänd → Publicerad (direction.md, section 4).
 * A rejected or withdrawn checklist has left that path, so it says so in a red token instead.
 */
export function StatusStepper({
  view,
  hasEarlierPublished,
}: {
  view: Pick<ChecklistView, "status" | "published_at">;
  /** Whether companies see another, earlier published checklist of the notice while this one is reviewed. */
  hasEarlierPublished: boolean;
}) {
  if (view.status === "rejected" || view.status === "none") {
    return (
      <Token
        label={isWithdrawn(view) ? "Tillbakadragen" : "Avvisad"}
        color="red"
        icon={<Icon icon="error" size="sm" />}
      />
    );
  }
  const active = ACTIVE_STEP[view.status];
  return (
    <VStack gap={1} hAlign="end" className={styles.status}>
      {/* Wide enough for the three steps side by side; on a phone it shows the current one under the track. */}
      <VStack className={styles.stepper}>
        <Stepper
          activeStep={active}
          label="Checklistans status"
          density="compact"
          horizontalOptions={{ minimumStepWidth: 112, collapsedVariant: "withLabel" }}
        >
          {STEPS.map((label, step) => (
            <Step key={label} step={step} label={label} status={view.status === "published" && step === 2 ? "success" : undefined} />
          ))}
        </Stepper>
      </VStack>
      {hasEarlierPublished && view.status !== "published" && (
        <Text type="supporting" className={styles.note}>
          Företagen ser i dag en tidigare publicerad version. Den här ersätter den när du publicerar.
        </Text>
      )}
    </VStack>
  );
}

/** "5 okt kl. 18:13". */
function shortDateTime(iso: string): string {
  const clock = formatClock(iso);
  return clock ? `${formatShortDate(iso)} ${clock}` : formatShortDate(iso);
}

function SourcesValue({ view }: { view: ChecklistView }) {
  const { citations_total: total, citations_verified: verified, citations_moved: moved } = view.verification;
  if (total === 0) return <Text>Inga källhänvisningar</Text>;
  const found = verified + moved;
  const isComplete = found === total;
  return (
    <HStack gap={1} vAlign="center">
      <Icon icon={isComplete ? "success" : "warning"} color={isComplete ? "success" : "warning"} size="sm" />
      <Text weight="semibold" hasTabularNumbers>{`${formatNumber(found)} av ${formatNumber(total)} hittade`}</Text>
    </HStack>
  );
}

/**
 * The facts the buyer checks the list against (direction.md, section 4 "MetadataList"): the notice's sista anbudsdag,
 * the checklist's own frågestopp, the document, when and how it was interpreted, and how the sources held up.
 */
export function ReviewFacts({
  view,
  checklist,
  notice,
  documentInfo,
}: {
  view: ChecklistView;
  checklist: Checklist;
  notice: NoticeDetail | undefined;
  documentInfo: DocumentInfo | undefined;
}) {
  const questionDate = checklist.dates[keyDateIndex(checklist, "fragestopp")]?.date ?? null;
  const isWide = useMediaQuery(WIDE_QUERY);
  const isPhone = useIsPhone();
  // One row of five on the workspace (the artboard's strip), two by two on a phone, else as many as fit.
  return (
    <Card>
      <MetadataList columns={isWide ? 5 : isPhone ? 2 : "multi"}>
        <MetadataListItem label={notice ? noticeDeadlineLabel(notice) : "Sista anbudsdag"}>
          {notice?.deadline_at ? (
            <DeadlineBlock deadline={notice.deadline_at} variant="compact" />
          ) : (
            <Text color="secondary">Anges inte i annonsen</Text>
          )}
        </MetadataListItem>
        <MetadataListItem label="Sista dag för frågor">
          {questionDate ? (
            <DeadlineBlock deadline={questionDate} variant="compact" />
          ) : (
            <Text color="secondary">Saknas i checklistan</Text>
          )}
        </MetadataListItem>
        <MetadataListItem label="Underlag">
          {documentInfo ? (
            <VStack gap={0.5} className={styles.fileValue}>
              <Text weight="semibold">{plural(documentInfo.page_count, "sida", "sidor")}</Text>
              <Link as="a" href={documentFileUrl(documentInfo.id)} download size="sm" maxLines={1}>
                {documentInfo.filename}
              </Link>
            </VStack>
          ) : (
            <Text color="secondary">Hämtas …</Text>
          )}
        </MetadataListItem>
        <MetadataListItem label="Tolkad">
          <VStack gap={0.5}>
            <Text weight="semibold" hasTabularNumbers>
              {shortDateTime(view.created_at)}
            </Text>
            <Text type="supporting">{view.model ? `${engineLabel(view.engine)}, ${view.model}` : engineLabel(view.engine)}</Text>
          </VStack>
        </MetadataListItem>
        <MetadataListItem label="Källor">
          <SourcesValue view={view} />
        </MetadataListItem>
      </MetadataList>
    </Card>
  );
}
