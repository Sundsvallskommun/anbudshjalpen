import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useJobs, useRunJob } from "../../api/queries";
import type { JobName, JobRunView } from "../../api/types";
import { ErrorNotice } from "../../components/states";
import { JOB_LABEL, JOBS } from "../../lib/labels";
import { Page } from "../../shell/Page";
import { RequireRole } from "../../shell/RequireRole";
import { AiUsageSection } from "./AiUsageSection";
import { failedFirst, JOB_GROUPS, RUN_STATE, runState, sinceText, statsLine, type JobGroup, type RunState } from "./jobs";
import styles from "./DriftPage.module.css";

const DESCRIPTION: Record<string, string> = Object.fromEntries(JOBS.map(({ job, description }) => [job, description]));

/** When the latest run was and what it did: "Senast i går kl. 03:00 · 120 hämtade · 4 nya". */
function runLine(state: RunState, run: JobRunView): string {
  if (state === "running") return `Startade ${sinceText(run.started_at)}`;
  const when = `Senast ${sinceText(run.finished_at ?? run.started_at)}`;
  return state === "failed" ? when : `${when} · ${statsLine(run.stats)}`;
}

/**
 * How the latest run went, on one line (direction.md, section 4): the state as a dot and in words, when it ran and
 * one line of its statistics. An error or a stopped fetch is said below it.
 */
function RunStatus({ job, run }: { job: JobName; run: JobRunView | undefined }) {
  const current = runState(job, run);
  const state = RUN_STATE[current];
  return (
    <VStack gap={0.5}>
      <HStack gap={2} vAlign="start">
        {/* The word beside the dot says the state; the dot repeats it in colour only. */}
        <Text type="inherit" aria-hidden="true">
          <StatusDot variant={state.dot} label={state.label} isPulsing={current === "running"} />
        </Text>
        {/* One run of text, so a narrow screen wraps it like a sentence and no separator is left at a line's end. */}
        <Text type="supporting" color="primary">
          <Text weight="medium">{state.label}</Text>
          {run ? ` · ${runLine(current, run)}` : null}
        </Text>
      </HStack>
      {current === "inactive" && (
        <Text type="supporting">e-Avrop hämtas när kommunens nyckel till e-Avrops API är inlagd (EAVROP_API_TOKEN och EAVROP_CLIENT_ID).</Text>
      )}
      {run?.error && <Text color="primary">{`Fel: ${run.error}`}</Text>}
    </VStack>
  );
}

function JobRow({
  job,
  run,
  isStarting,
  isBusy,
  onRun,
}: {
  job: JobName;
  run: JobRunView | undefined;
  isStarting: boolean;
  isBusy: boolean;
  onRun: () => void;
}) {
  const label = JOB_LABEL[job] ?? job;
  return (
    <VStack as="li" gap={1} className={styles.row}>
      {/* The button stays beside the job's name, on a phone too. */}
      <HStack gap={3} vAlign="start" hAlign="between">
        <VStack gap={0.5} className={styles.main}>
          <Heading level={3}>{label}</Heading>
          <Text type="supporting">{DESCRIPTION[job]}</Text>
        </VStack>
        <VStack className={styles.run}>
          <Button label={`Kör nu: ${label}`} size="sm" isLoading={isStarting} isDisabled={isBusy} onClick={onRun}>
            Kör nu
          </Button>
        </VStack>
      </HStack>
      <RunStatus job={job} run={run} />
    </VStack>
  );
}

function Group({
  group,
  latest,
  run,
}: {
  group: JobGroup;
  latest: (job: JobName) => JobRunView | undefined;
  run: ReturnType<typeof useRunJob>;
}) {
  const headingId = `drift-${group.title}`;
  return (
    <Card padding={0}>
      <VStack as="section" aria-labelledby={headingId} gap={0}>
        <VStack gap={0.5} className={styles.head}>
          <Heading level={2} id={headingId}>
            {group.title}
          </Heading>
          <Text type="supporting">{group.description}</Text>
        </VStack>
        <VStack as="ul" role="list" gap={0} aria-label={group.title}>
          {failedFirst(group.jobs, latest).map((job) => (
            <JobRow
              key={job}
              job={job}
              run={latest(job)}
              isStarting={run.isPending && run.variables === job}
              isBusy={run.isPending}
              onRun={() => run.mutate(job)}
            />
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

function Drift() {
  const jobs = useJobs();
  const run = useRunJob();
  const latest = (job: JobName) => jobs.data?.find((candidate) => candidate.job === job);
  return (
    <Page
      title="Drift"
      breadcrumbs={[{ label: "Inköp", href: "/inkop" }]}
      width={960}
      intro="Här ser du vad AI-motorn har använts till och vad det uppskattningsvis kostar. Jobben körs automatiskt enligt schema: här ser du hur det gick senast och kan starta ett jobb direkt, till exempel i en demo."
    >
      <AiUsageSection />
      {jobs.isError && <ErrorNotice title="Jobben kunde inte hämtas" error={jobs.error} onRetry={() => jobs.refetch()} />}
      {run.isError && (
        <ErrorNotice title={`${(run.variables && JOB_LABEL[run.variables]) ?? "Jobbet"} kunde inte startas`} error={run.error} />
      )}
      {JOB_GROUPS.map((group) => (
        <Group key={group.title} group={group} latest={latest} run={run} />
      ))}
    </Page>
  );
}

/**
 * Drift (direction.md, section 4): first the AI engine's usage and estimated cost (`AiUsageSection`), then the
 * scheduled jobs grouped as Hämta, Bearbeta and Skicka, each with how its latest run went, when, one line of its
 * statistics, and "Kör nu". Failed jobs come first in their group. Reached from the account menu.
 */
export default function DriftPage() {
  return <RequireRole role="inkopare" title="Drift">{() => <Drift />}</RequireRole>;
}
