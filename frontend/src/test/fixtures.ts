/**
 * Fictitious API responses for tests, shaped exactly like the backend's (src/api/types.ts). The notice is
 * the demo journey's "Ommålning av Solbackens förskola"; every name and number is made up.
 */
import type {
  AnswerView,
  AppConfig,
  ChecklistAdminItem,
  ChecklistView,
  LabCompanyRef,
  MatchView,
  NoticeBuyers,
  NoticeDetail,
  NoticeList,
  NoticeSummary,
  PageView,
  Persona,
  PublishedAnswerView,
  ReminderView,
  ReviewView,
  SessionView,
  UserView,
} from "../api/types";

export const NOTICE_ID = "6f1c2a52-0a43-4c47-9d7e-1f3f0c6b9a01";
export const DOCUMENT_ID = "0b8e4c1d-5f9a-4e2b-8c3d-7a6b5c4d3e21";
export const CHECKLIST_ID = "c4a1e7f2-3b6d-4c8e-9f0a-1b2c3d4e5f60";

export const config: AppConfig = {
  organization_name: "Sundsvalls kommun",
  ai_engine: "heuristic",
  ai_disclosure: "Anbudshjälpen använder AI. Kontrollera alltid svaren mot underlaget.",
  demo_notice: "Demo: underlag, företag och personer är fiktiva.",
  eavrop_url: "https://www.e-avrop.com/sundsvall",
  gate_required: false,
  lab_enabled: false,
  review_required: true,
};

export const companyUser: UserView = {
  id: "8d7c6b5a-4f3e-4d2c-9b1a-0f9e8d7c6b5a",
  name: "Anna Berg",
  email: "anna@example.invalid",
  role: "foretagare",
  company: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Målerifirman i Matfors AB" },
  lab: null,
};

/** A workshop participant's own company (decision 0010). */
export const labUser: UserView = {
  id: "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
  name: "Deltagare",
  email: "lab-5e6f7a8b@anbudsklar.local",
  role: "foretagare",
  company: { id: "6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7a8b9c0", name: "Fiktiv Snickeri AB" },
  lab: { expires_at: "2026-11-11T12:00:00Z" },
};

export const buyerUser: UserView = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  name: "Lars Holm",
  email: "lars@example.invalid",
  role: "inkopare",
  company: null,
  lab: null,
};

/** The personas as the backend names them (services/personas.py): "Name, company" and the role in a sentence. */
const personas: Persona[] = [
  {
    key: "foretagare",
    label: "Anna Berg, Målerifirman i Matfors AB",
    description: "Företagare som letar efter upphandlingar, ställer frågor och granskar sitt anbudsutkast.",
  },
  {
    key: "inkopare",
    label: "Lars Holm, inköpare",
    description: "Inköpare som granskar, godkänner och publicerar checklistor.",
  },
];

export function session(user: UserView | null, labCompanies: LabCompanyRef[] = []): SessionView {
  return { user, personas, lab_companies: labCompanies };
}

export const noticeSummary: NoticeSummary = {
  id: NOTICE_ID,
  title: "Ommålning av Solbackens förskola, Matfors",
  buyer: "Sundsvalls kommun",
  reference_number: "DEMO-2026-0147",
  source: "fixture",
  status: "open",
  published_at: "2026-09-21T08:00:00+02:00",
  deadline_at: "2026-10-26T23:59:00+01:00",
  deadline_kind: "tender",
  // The published checklist's frågestopp (2026-10-16) as the end of that day.
  question_deadline: "2026-10-16T23:59:59+02:00",
  cpv_codes: ["45442100"],
  cpv_label: "Målning",
  has_documents: true,
  checklist_status: "published",
  checklist_reviewed: true,
  is_fictitious: true,
  fit: "passar_delvis",
};

export const noticeList: NoticeList = {
  items: [noticeSummary],
  total: 1,
  counts: { open: 1, planned: 0, all: 1 },
  sort: "deadline",
};

/** The list's buyer choices: a joint procurement counts for each of its buyers. */
export const noticeBuyers: NoticeBuyers = {
  items: [
    { name: "Sundsvalls kommun", count: 12 },
    { name: "MittSverige Vatten & Avfall AB", count: 3 },
    { name: "Timrå kommun", count: 2 },
  ],
};

export const checklistView: ChecklistView = {
  id: CHECKLIST_ID,
  notice_id: NOTICE_ID,
  document_id: DOCUMENT_ID,
  status: "published",
  engine: "heuristic",
  model: null,
  created_at: "2026-09-22T09:00:00+02:00",
  approved_at: "2026-09-23T10:00:00+02:00",
  published_at: "2026-09-23T10:05:00+02:00",
  reviewed: true,
  reviewer_note: null,
  verification: { citations_total: 4, citations_verified: 2, citations_moved: 1, citations_unverified: 1 },
  checklist: {
    summary: "Kommunen vill måla om förskolan invändigt. Anbudet ska innehålla ett försäkringsbevis.",
    procedure: "Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
    requirements: [
      {
        id: "K1",
        kind: "skallkrav",
        title: "Ansvarsförsäkring om minst 5 miljoner kronor",
        plain_language: "Företaget måste ha en ansvarsförsäkring och visa ett försäkringsbevis.",
        evidence: "Bifoga försäkringsbevis.",
        citation: { page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null, document: null, document_id: null },
      },
      {
        id: "K2",
        kind: "kvalificeringskrav",
        title: "Två referensuppdrag",
        plain_language: "Två liknande uppdrag i offentlig miljö de senaste tre åren.",
        evidence: null,
        citation: { page: 5, quote: "två referensuppdrag", check: "moved", found_page: 6, document: null, document_id: null },
      },
    ],
    attachments: [
      {
        name: "Prisbilaga",
        description: null,
        citation: { page: 12, quote: "Bilaga 1 Prisbilaga", check: "unverified", found_page: null, document: null, document_id: null },
      },
    ],
    evaluation: [
      {
        name: "Pris",
        weight_percent: 70,
        how_assessed: "Lägst pris får högst poäng.",
        citation: { page: 9, quote: "Pris 70 %", check: "verified", found_page: null, document: null, document_id: null },
      },
    ],
    dates: [
      {
        kind: "fragestopp",
        date: "2026-10-16",
        description: "Frågor ställs i e-Avrop.",
        citation: { page: 2, quote: "Sista dag för frågor", check: "verified", found_page: null, document: null, document_id: null },
      },
    ],
    terms: [
      { term: "försäkringsbevis", explanation: "Ett intyg från försäkringsbolaget om att försäkringen gäller.", citation: null },
    ],
    open_questions: [],
  },
};

export const noticeDetail: NoticeDetail = {
  ...noticeSummary,
  description: "Invändig ommålning av förskolans lokaler.",
  procedure: "Annonserad upphandling under tröskelvärdena (19 kap. LOU)",
  url: "https://example.invalid/e-avrop/annons/1",
  documents_url: "https://example.invalid/e-avrop/underlag/1",
  place: "Matfors",
  estimated_value_sek: 800000,
  cpv_labels: { "45442100": "Målning" },
  documents: [{ id: DOCUMENT_ID, filename: "Förfrågningsunderlag Solbacken.pdf", page_count: 16, is_fictitious: true }],
  checklist: checklistView,
  match: null,
  published_answers: [],
};

/** An answer the buyer published in e-Avrop, as the question step lists them. */
export const publishedAnswer: PublishedAnswerView = {
  source: "eavrop",
  question: "Ska ställning ingå i priset för fasadmålningen?",
  answer: "Ja, ställning ingår i anbudspriset. Prisbilagan är uppdaterad.",
  asked_at: "2026-09-28T16:42:46+02:00",
  answered_at: "2026-09-30T10:38:45+02:00",
};

export const pageFour: PageView = {
  document_id: DOCUMENT_ID,
  page_no: 4,
  page_count: 16,
  text: "3.2 Försäkring\nLeverantören ska ha en\nansvarsförsäkring om minst 5 000 000 kronor.",
};

export const answerNotInDocument: AnswerView = {
  answer: {
    answer: "Underlaget säger inget om arbete på helger.",
    found_in_document: false,
    citations: [{ page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null, document: null, document_id: null }],
    suggest_formal_question: true,
  },
  engine: "heuristic",
  document_id: DOCUMENT_ID,
  read: { documents_read: 1, documents_total: 1, pages_read: 16, pages_total: 16 },
  // The checklist's frågestopp is a date; the backend sends it as the end of that day in Swedish time.
  question_deadline: "2026-10-16T23:59:59+02:00",
  formal_question_url: "https://example.invalid/e-avrop/underlag/1",
};

export const reminder: ReminderView = {
  id: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
  notice_id: NOTICE_ID,
  notice_title: noticeSummary.title,
  kind: "fragestopp",
  note: null,
  due_at: "2026-10-14T08:00:00+02:00",
  // Frågestopp is a date (the checklist's 2026-10-16); the backend sends the end of that day in Swedish time.
  deadline_at: "2026-10-16T23:59:59+02:00",
  sent_at: null,
};

export const reviewView: ReviewView = {
  result: {
    summary: "Två krav behöver kompletteras.",
    checks: [
      { requirement_id: "K2", status: "uppfyllt", comment: "Två referenser finns.", draft_quote: null, draft_page: null, draft_check: null },
      {
        requirement_id: "K1",
        status: "obevisat",
        comment: "Försäkringen nämns men beviset saknas.",
        draft_quote: "Vi har ansvarsförsäkring",
        draft_page: 2,
        draft_check: "verified",
      },
    ],
    attachments: [{ name: "Prisbilaga", status: "saknas", comment: "Prisbilagan är inte bifogad." }],
  },
  requirement_titles: { K1: "Ansvarsförsäkring om minst 5 miljoner kronor", K2: "Två referensuppdrag" },
  engine: "heuristic",
  stored: false,
};

export const draftChecklistView: ChecklistView = {
  ...checklistView,
  status: "draft",
  approved_at: null,
  published_at: null,
  reviewed: false,
};

/** A draft the buyer rejected, with the reason; POST .../reopen turns it back into a draft that keeps the note. */
export const rejectedChecklistView: ChecklistView = {
  ...draftChecklistView,
  status: "rejected",
  reviewer_note: "Frågestoppet har fel datum. Rätta det mot underlaget.",
};

/** The company's match on the demo notice, as the heuristic engine words it (no inköp review for matches). */
export const matchView: MatchView = {
  id: "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
  notice: noticeSummary,
  fit: "passar_delvis",
  assessment: {
    fit: "passar_delvis",
    summary:
      "Upphandlingen passar er delvis. Bedömningen bygger på CPV-koder och sakord i profilen och annonsen och på " +
      "vad profilen säger om kraven i checklistan; allmänna ord om upphandling och ortnamn räknas inte.",
    reasons: [
      { kind: "styrka", text: "Upphandlingen gäller målning – det gör ni.", requirement_id: null, citation: null },
      {
        kind: "styrka",
        text: "Ni har angett en försäkring i profilen. Kontrollera att den räcker för kravet.",
        requirement_id: "K1",
        citation: {
          page: 4,
          quote: "Leverantören ska ha en ansvarsförsäkring",
          check: "verified",
          found_page: null, document: null, document_id: null,
        },
      },
      {
        kind: "oklart",
        text: "Underlaget ställer krav på referensuppdrag, men er profil säger inget om det.",
        requirement_id: "K2",
        citation: { page: 5, quote: "två referensuppdrag", check: "moved", found_page: 6, document: null, document_id: null },
      },
    ],
  },
  engine: "heuristic",
  created_at: "2026-10-05T06:30:00+02:00",
};

/** The demo checklist as a row in the buyer's queue, waiting for review. */
export const checklistAdminItem: ChecklistAdminItem = {
  id: CHECKLIST_ID,
  notice_id: NOTICE_ID,
  notice_title: noticeSummary.title,
  deadline_at: noticeSummary.deadline_at,
  deadline_kind: noticeSummary.deadline_kind,
  status: "draft",
  engine: "heuristic",
  created_at: "2026-09-22T09:00:00+02:00",
  verification: checklistView.verification,
  requirement_count: checklistView.checklist.requirements.length,
};
