/** Swedish words for the contract's codes. One place, so a status reads the same on every page. */
import type {
  AttachmentCheck,
  CheckStatus,
  ChecklistStatus,
  CitationCheck,
  DateKind,
  Fit,
  JobName,
  MatchReason,
  NoticeStatus,
  ReminderKind,
  RequirementKind,
} from "../api/types";

export const NOTICE_STATUS: Record<NoticeStatus, string> = {
  open: "Öppen för anbud",
  planned: "Planerad",
  closed: "Stängd",
  awarded: "Tilldelad",
};

export const CHECKLIST_STATUS: Record<ChecklistStatus, string> = {
  none: "Ingen checklista",
  draft: "Utkast",
  approved: "Godkänd",
  published: "Publicerad",
  rejected: "Avvisad",
};

export const FIT: Record<Fit, string> = {
  passar: "Passar",
  passar_delvis: "Passar delvis",
  passar_inte: "Passar inte",
};

export const REQUIREMENT_KINDS: { kind: RequirementKind; label: string; description: string }[] = [
  {
    kind: "skallkrav",
    label: "Skallkrav",
    description: "Måste vara uppfyllda. Annars kan anbudet inte antas.",
  },
  {
    kind: "kvalificeringskrav",
    label: "Kvalificeringskrav",
    description: "Krav på företaget, till exempel registrering, ekonomi, försäkringar och tidigare uppdrag.",
  },
  {
    kind: "krav_pa_uppdraget",
    label: "Krav på uppdraget",
    description: "Vad som ska levereras och hur arbetet ska utföras.",
  },
  {
    kind: "avtalsvillkor",
    label: "Avtalsvillkor",
    description: "Villkor som gäller när avtalet har tecknats.",
  },
];

export const DATE_KIND: Record<DateKind, string> = {
  fragestopp: "Sista dag för frågor",
  sista_anbudsdag: "Sista anbudsdag",
  anbudets_giltighet: "Anbudets giltighetstid",
  tilldelning: "Planerat tilldelningsbeslut",
  avtalsstart: "Avtalsstart",
  annat: "Datum",
};

export const CHECK_STATUS: Record<CheckStatus, string> = {
  uppfyllt: "Uppfyllt",
  obevisat: "Obevisat",
  saknas: "Saknas",
  oklart: "Oklart",
};

export const ATTACHMENT_STATUS: Record<AttachmentCheck["status"], string> = {
  bifogad: "Bifogad",
  saknas: "Saknas",
  oklart: "Oklart",
};

export const REASON_KIND: Record<MatchReason["kind"], string> = {
  styrka: "Styrka",
  hinder: "Hinder",
  oklart: "Oklart",
};

export const REMINDER_KIND: Record<ReminderKind, string> = {
  fragestopp: "Sista dag för frågor",
  sista_anbudsdag: "Sista anbudsdag",
  egen: "Egen påminnelse",
};

export const JOBS: { job: JobName; label: string; description: string }[] = [
  { job: "ingest_ted", label: "Hämta annonser från TED", description: "Annonser från EU:s annonsdatabas." },
  { job: "ingest_eavrop", label: "Hämta annonser från e-Avrop", description: "Kommunens annonser och planerade upphandlingar." },
  { job: "ingest_lou", label: "Uppdatera LOU", description: "Lagtexten från Riksdagens öppna data." },
  {
    job: "close_expired",
    label: "Stäng passerade annonser",
    description: "Stänger öppna annonser vars sista anbudsdag har passerat.",
  },
  { job: "interpret_pending", label: "Tolka nya underlag", description: "Gör checklistor av uppladdade underlag." },
  { job: "match_all", label: "Bedöm matchningar", description: "Jämför företagens profiler med upphandlingarna." },
  { job: "send_reminders", label: "Skicka påminnelser", description: "Mejlar påminnelser som har förfallit." },
  { job: "notify_matches", label: "Meddela träffar", description: "Mejlar företag om nya upphandlingar som passar dem." },
];

export const JOB_LABEL: Record<string, string> = Object.fromEntries(JOBS.map(({ job, label }) => [job, label]));

const SOURCES: Record<string, string> = {
  ted: "TED",
  eavrop: "e-Avrop",
  fixture: "Demo",
  manual: "Inlagd av inköp",
};

export function sourceLabel(source: string): string {
  return SOURCES[source] ?? source;
}

const ENGINES: Record<string, string> = {
  heuristic: "regelbaserad sammanställning utan språkmodell",
  eneo: "Eneo",
  openai: "språkmodell",
};

export function engineLabel(engine: string): string {
  return ENGINES[engine] ?? engine;
}

/** How a citation was verified against the document, in the words every citation chip uses. */
export function citationStatus(check: CitationCheck | null): string {
  if (check === "verified") return "Verifierat citat";
  if (check === "moved") return "Hittat på annan sida";
  return "Kunde inte kontrolleras";
}
