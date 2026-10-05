import { Button } from "@astryxdesign/core/Button";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { DateInput } from "@astryxdesign/core/DateInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useState, type FormEvent } from "react";
import {
  useAdminChecklists,
  useConfig,
  useCreateNotice,
  useInsights,
  useInterpretations,
  useInterpretDocument,
  useJobs,
  useRunJob,
} from "../../api/queries";
import type {
  ChecklistAdminItem,
  ChecklistStatus,
  InsightItem,
  InterpretationState,
  InterpretationView,
  JobName,
  JobRunView,
  NoticeDetail,
} from "../../api/types";
import { verificationSentence } from "../../components/checklist/ChecklistSections";
import { DocumentUpload } from "../../components/DocumentUpload";
import { Row, RowList } from "../../components/RowList";
import { ErrorNotice, Loading } from "../../components/states";
import { ChecklistStatusToken } from "../../components/tokens";
import { UrlTabs } from "../../components/UrlTabs";
import { formatDate, formatDateTime, formatNumber, plural, splitList, swedishTimeToIso } from "../../lib/format";
import { engineLabel, JOB_LABEL, JOBS } from "../../lib/labels";
import { Page } from "../../shell/Page";
import { RequireRole } from "../../shell/RequireRole";

const QUEUE_FILTERS: { value: ChecklistStatus | "all"; label: string }[] = [
  { value: "draft", label: "Att granska" },
  { value: "approved", label: "Godkända, inte publicerade" },
  { value: "published", label: "Publicerade" },
  { value: "rejected", label: "Avvisade" },
  { value: "all", label: "Alla" },
];

function QueueItem({ item }: { item: ChecklistAdminItem }) {
  const { citations_unverified: unverified } = item.verification;
  return (
    <VStack gap={2}>
      <Heading level={3}>
        <Link href={`/inkop/checklistor/${item.id}`}>{item.notice_title}</Link>
      </Heading>
      <HStack gap={2} wrap="wrap">
        <ChecklistStatusToken status={item.status} />
        <Token label={plural(item.requirement_count, "krav", "krav")} />
        {unverified > 0 && (
          <Token
            label={`${formatNumber(unverified)} citat att kontrollera`}
            color="yellow"
            icon={<Icon icon="warning" size="sm" />}
          />
        )}
      </HStack>
      <Text color="secondary">{`${verificationSentence(item.verification)} Skapad ${formatDateTime(item.created_at)} av ${engineLabel(item.engine)}.`}</Text>
    </VStack>
  );
}

function Queue() {
  const [status, setStatus] = useState<ChecklistStatus | "all">("draft");
  const checklists = useAdminChecklists(status);
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Checklistor att granska</Heading>
        <Text color="secondary">
          AI:n gör om underlaget till en checklista. Granska den, rätta det som är fel och publicera den. Företagen ser
          bara publicerade checklistor.
        </Text>
      </VStack>
      <HStack>
        <Selector
          label="Visa"
          options={QUEUE_FILTERS}
          value={status}
          onChange={(value) => setStatus(value as ChecklistStatus | "all")}
        />
      </HStack>
      {checklists.isPending && <Loading label="Hämtar checklistor …" />}
      {checklists.isError && (
        <ErrorNotice title="Checklistorna kunde inte hämtas" error={checklists.error} onRetry={() => checklists.refetch()} />
      )}
      {checklists.isSuccess && checklists.data.length === 0 && (
        <EmptyState
          headingLevel={3}
          title="Inget att visa"
          description={status === "draft" ? "Alla checklistor är granskade." : "Inga checklistor har den statusen."}
        />
      )}
      {checklists.isSuccess && checklists.data.length > 0 && (
        <RowList label="Checklistor">
          {checklists.data.map((item) => (
            <Row key={item.id}>
              <QueueItem item={item} />
            </Row>
          ))}
        </RowList>
      )}
    </VStack>
  );
}

const INTERPRETATION_LOOK: Record<
  InterpretationState,
  { label: string; color: "blue" | "yellow" | "red"; icon: "info" | "warning" | "error" }
> = {
  pending: { label: "Väntar på tolkning", color: "blue", icon: "info" },
  retrying: { label: "Försöker igen", color: "yellow", icon: "warning" },
  failed: { label: "Tolkningen gav upp", color: "red", icon: "error" },
};

function InterpretationItem({ item }: { item: InterpretationView }) {
  const interpret = useInterpretDocument();
  const look = INTERPRETATION_LOOK[item.state];
  const action = item.state === "pending" ? "Tolka nu" : "Tolka igen";
  return (
    <VStack gap={2}>
      <Heading level={3}>
        <Link href={`/upphandlingar/${item.notice_id}`}>{item.notice_title}</Link>
      </Heading>
      <HStack gap={2} wrap="wrap" vAlign="center">
        <Token label={look.label} color={look.color} icon={<Icon icon={look.icon} size="sm" />} />
        <Text color="secondary">{item.filename}</Text>
      </HStack>
      {item.attempts > 0 && (
        <Text color="secondary">
          {`${plural(item.attempts, "försök", "försök")}.${
            item.state === "retrying" && item.retry_at ? ` Nästa försök ${formatDateTime(item.retry_at)}.` : ""
          }`}
        </Text>
      )}
      {item.error && <Text>{`Senaste fel: ${item.error}`}</Text>}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={`${action}: ${item.filename}`}
          size="sm"
          isLoading={interpret.isPending}
          isDisabled={interpret.isSuccess}
          onClick={() => interpret.mutate(item.document_id)}
        >
          {action}
        </Button>
        {interpret.isSuccess && (
          <Text color="secondary" role="status">
            Tolkningen har startat. Utkastet hamnar i granskningskön när den är klar.
          </Text>
        )}
      </HStack>
      {interpret.isError && <ErrorNotice title="Tolkningen kunde inte startas" error={interpret.error} />}
    </VStack>
  );
}

/** Documents that have no checklist yet. A failed interpretation needs the buyer: the worker has given up on it. */
function Interpretations() {
  const interpretations = useInterpretations();
  if (interpretations.isError) {
    return (
      <ErrorNotice
        title="Underlagen som väntar på tolkning kunde inte hämtas"
        error={interpretations.error}
        onRetry={() => interpretations.refetch()}
      />
    );
  }
  if (!interpretations.isSuccess || interpretations.data.length === 0) return null;
  return (
    <VStack gap={4} as="section" aria-labelledby="interpretations-heading">
      <VStack gap={1}>
        <Heading level={2} id="interpretations-heading">
          Underlag utan checklista
        </Heading>
        <Text color="secondary">
          Underlag som AI:n inte har gjort om till en checklista än. Ett misslyckat försök görs om automatiskt några
          gånger. Har tolkningen gett upp, läs felet och tolka igen när orsaken är åtgärdad.
        </Text>
      </VStack>
      <RowList label="Underlag utan checklista">
        {interpretations.data.map((item) => (
          <Row key={item.document_id}>
            <InterpretationItem item={item} />
          </Row>
        ))}
      </RowList>
    </VStack>
  );
}

/** Today's names in LOU. "Förenklat förfarande" and "urvalsförfarande" left the law on 1 February 2022. */
const PROCEDURES = [
  "Öppet förfarande",
  "Selektivt förfarande",
  "Förhandlat förfarande med föregående annonsering",
  "Förhandlat förfarande utan föregående annonsering",
  "Konkurrenspräglad dialog",
  "Innovationspartnerskap",
  "Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
  "Direktupphandling",
  "Dynamiskt inköpssystem",
];

function NewNotice() {
  const config = useConfig();
  const create = useCreateNotice();
  const [title, setTitle] = useState("");
  const [buyer, setBuyer] = useState("");
  const [description, setDescription] = useState("");
  const [cpv, setCpv] = useState("");
  const [procedure, setProcedure] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<ISODateString | undefined>();
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<NoticeDetail | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      {
        title: title.trim(),
        buyer: buyer.trim() || config.data?.organization_name || null,
        description: description.trim() || null,
        cpv_codes: splitList(cpv),
        procedure,
        // A picked day closes at 23:59 Swedish time.
        deadline_at: deadline ? swedishTimeToIso(deadline, "23:59") : null,
        url: url.trim() || null,
      },
      { onSuccess: setCreated },
    );
  };

  if (created) {
    return (
      <VStack gap={4}>
        <HStack gap={1} vAlign="center" role="status">
          <Icon icon="success" color="success" />
          <Heading level={2}>Upphandlingen är skapad</Heading>
        </HStack>
        <Link href={`/upphandlingar/${created.id}`} isStandalone>
          {created.title}
        </Link>
        <Text>Ladda upp förfrågningsunderlaget, så tas en checklista fram som du sedan granskar.</Text>
        <DocumentUpload noticeId={created.id} />
        <HStack>
          <Button
            label="Skapa en till"
            variant="ghost"
            onClick={() => {
              setCreated(null);
              create.reset();
              setTitle("");
              setDescription("");
              setCpv("");
              setUrl("");
              setDeadline(undefined);
            }}
          />
        </HStack>
      </VStack>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label="Ny upphandling">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Ny upphandling</Heading>
          <Text color="secondary">För underlag som inte kommer från TED eller e-Avrop, till exempel vid ett test.</Text>
        </VStack>
        <FormLayout defaultOptionality="optional">
          <TextInput label="Rubrik" value={title} onChange={setTitle} isRequired />
          <TextInput
            label="Upphandlande organisation"
            value={buyer}
            onChange={setBuyer}
            placeholder={config.data?.organization_name}
          />
          <TextArea label="Beskrivning" value={description} onChange={setDescription} rows={4} maxLength={8000} />
          <TextInput
            label="CPV-koder"
            description="Åtta siffror, separera med kommatecken."
            value={cpv}
            onChange={setCpv}
          />
          <Selector
            label="Förfarande"
            options={PROCEDURES}
            value={procedure}
            onChange={setProcedure}
            hasClear
          />
          <DateInput
            label="Sista anbudsdag"
            value={deadline}
            onChange={setDeadline}
            weekStartsOn="mon"
            hasClear
            // The native picker probes the engine with an injected <style>, which the strict CSP blocks.
            nativePicker="never"
          />
          <TextInput label="Länk till annonsen" value={url} onChange={setUrl} />
        </FormLayout>
        <HStack>
          <Button
            type="submit"
            label="Skapa upphandlingen"
            variant="primary"
            isLoading={create.isPending}
            isDisabled={title.trim().length < 3}
          />
        </HStack>
        {create.isError && <ErrorNotice title="Upphandlingen kunde inte skapas" error={create.error} />}
      </VStack>
    </form>
  );
}

function InsightRow({ item }: { item: InsightItem }) {
  return (
    <VStack gap={2}>
      <Heading level={3}>
        <Link href={`/upphandlingar/${item.notice_id}`}>{item.notice_title}</Link>
      </Heading>
      {item.deadline_at && <Text color="secondary">{`Sista anbudsdag ${formatDate(item.deadline_at)}`}</Text>}
      <HStack gap={2} wrap="wrap">
        <Token label={plural(item.question_count, "fråga", "frågor")} />
        <Token label={`${formatNumber(item.not_in_document_count)} utan svar i underlaget`} />
        <Token label={`${formatNumber(item.formal_question_suggestions)} hänvisade till e-Avrop`} />
      </HStack>
      {item.visible ? (
        item.sample_questions.length > 0 && (
          <VStack gap={1}>
            <Text weight="semibold">Exempel på frågor</Text>
            <VStack as="ul" role="list" gap={1} aria-label="Exempel på frågor">
              {item.sample_questions.map((question) => (
                <li key={question}>
                  <Text>{question}</Text>
                </li>
              ))}
            </VStack>
          </VStack>
        )
      ) : (
        <Text color="secondary">
          Frågorna visas först efter sista anbudsdag, så att inget under anbudstiden kan gynna någon leverantör.
        </Text>
      )}
    </VStack>
  );
}

function Insights() {
  const insights = useInsights();
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Frågor från företag</Heading>
        <Text color="secondary">
          Sammanställt per upphandling. Många frågor utan svar i underlaget kan tyda på att något behöver förtydligas
          nästa gång.
        </Text>
      </VStack>
      {insights.isPending && <Loading label="Hämtar insikter …" />}
      {insights.isError && (
        <ErrorNotice title="Insikterna kunde inte hämtas" error={insights.error} onRetry={() => insights.refetch()} />
      )}
      {insights.isSuccess && insights.data.length === 0 && (
        <EmptyState headingLevel={3} title="Inga frågor ännu" description="Här syns frågor när företag har ställt några." />
      )}
      {insights.isSuccess && insights.data.length > 0 && (
        <RowList label="Frågor per upphandling">
          {insights.data.map((item) => (
            <Row key={item.notice_id}>
              <InsightRow item={item} />
            </Row>
          ))}
        </RowList>
      )}
    </VStack>
  );
}

const RUN_STATUS: Record<string, string> = {
  running: "Pågår",
  succeeded: "Klar",
  success: "Klar",
  ok: "Klar",
  failed: "Misslyckades",
  error: "Misslyckades",
};

/** The latest run of a job; the backend lists the latest run of every job that has run. */
function JobRunText({ run }: { run: JobRunView | undefined }) {
  if (!run) return <Text color="secondary">Har inte körts ännu.</Text>;
  const status = RUN_STATUS[run.status] ?? run.status;
  return (
    <VStack gap={1}>
      <Text color="secondary">{`Senast ${formatDateTime(run.started_at)}: ${status.toLocaleLowerCase("sv")}.`}</Text>
      {run.error && <Text>{`Fel: ${run.error}`}</Text>}
    </VStack>
  );
}

function Jobs() {
  const jobs = useJobs();
  const run = useRunJob();
  const latest = (job: JobName) => jobs.data?.find((candidate) => candidate.job === job);
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Jobb</Heading>
        <Text color="secondary">Jobben körs automatiskt enligt schema. Här kan du starta dem direkt, till exempel i en demo.</Text>
      </VStack>
      {jobs.isError && <ErrorNotice title="Jobben kunde inte hämtas" error={jobs.error} onRetry={() => jobs.refetch()} />}
      {run.isError && (
        <ErrorNotice
          title={`${(run.variables && JOB_LABEL[run.variables]) ?? "Jobbet"} kunde inte startas`}
          error={run.error}
        />
      )}
      <RowList label="Jobb">
        {JOBS.map(({ job, label, description }) => (
          <Row key={job}>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <VStack gap={1}>
                <Heading level={3}>{label}</Heading>
                <Text>{description}</Text>
                {jobs.isPending ? (
                  <Text color="secondary">Hämtar status …</Text>
                ) : (
                  <JobRunText run={latest(job)} />
                )}
              </VStack>
              <Button
                label={`Kör nu: ${label}`}
                size="sm"
                isLoading={run.isPending && run.variables === job}
                isDisabled={run.isPending}
                onClick={() => run.mutate(job)}
              >
                Kör nu
              </Button>
            </HStack>
          </Row>
        ))}
      </RowList>
    </VStack>
  );
}

/** The buyer's view: review queue, manual notices, question insights and scheduled jobs. */
export default function BuyerPage() {
  return (
    <RequireRole role="inkopare" title="Inköp">
      {() => (
        <Page title="Inköp" intro="Granska checklistor innan företagen ser dem, och följ vad företagen frågar om.">
          <UrlTabs
            idPrefix="inkop"
            tabs={[
              {
                value: "granska",
                label: "Granskningskö",
                render: () => (
                  <VStack gap={8}>
                    <Queue />
                    <Interpretations />
                  </VStack>
                ),
              },
              { value: "ny", label: "Ny upphandling", render: () => <NewNotice /> },
              { value: "insikter", label: "Frågor från företag", render: () => <Insights /> },
              { value: "jobb", label: "Jobb", render: () => <Jobs /> },
            ]}
          />
        </Page>
      )}
    </RequireRole>
  );
}
