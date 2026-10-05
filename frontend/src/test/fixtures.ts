/**
 * Fictitious API responses for tests, shaped exactly like the backend's (src/api/types.ts). The notice is
 * the demo journey's "Ommålning av Solbackens förskola"; every name and number is made up.
 */
import type {
  AnswerView,
  AppConfig,
  ChecklistView,
  NoticeDetail,
  NoticeList,
  NoticeSummary,
  PageView,
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
  ai_disclosure: "Anbudsklar använder AI. Kontrollera alltid svaren mot underlaget.",
  demo_notice: "Demo: underlag, företag och personer är fiktiva.",
  eavrop_url: "https://www.e-avrop.com/sundsvall",
};

export const companyUser: UserView = {
  id: "8d7c6b5a-4f3e-4d2c-9b1a-0f9e8d7c6b5a",
  name: "Anna Berg",
  email: "anna@example.invalid",
  role: "foretagare",
  company: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Målerifirman i Matfors AB" },
};

export const buyerUser: UserView = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  name: "Lars Holm",
  email: "lars@example.invalid",
  role: "inkopare",
  company: null,
};

const personas = [
  { key: "foretagare" as const, label: "Anna Berg", description: "Målerifirman i Matfors AB" },
  { key: "inkopare" as const, label: "Lars Holm", description: "Inköp, Sundsvalls kommun" },
];

export function session(user: UserView | null): SessionView {
  return { user, personas };
}

export const noticeSummary: NoticeSummary = {
  id: NOTICE_ID,
  title: "Ommålning av Solbackens förskola, Matfors",
  buyer: "Sundsvalls kommun",
  source: "fixture",
  status: "open",
  published_at: "2026-09-21T08:00:00+02:00",
  deadline_at: "2026-10-26T23:59:00+01:00",
  cpv_codes: ["45442100"],
  has_documents: true,
  checklist_status: "published",
  is_fictitious: true,
  fit: "passar_delvis",
};

export const noticeList: NoticeList = { items: [noticeSummary], total: 1 };

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
        citation: { page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null },
      },
      {
        id: "K2",
        kind: "kvalificeringskrav",
        title: "Två referensuppdrag",
        plain_language: "Två liknande uppdrag i offentlig miljö de senaste tre åren.",
        evidence: null,
        citation: { page: 5, quote: "två referensuppdrag", check: "moved", found_page: 6 },
      },
    ],
    attachments: [
      {
        name: "Prisbilaga",
        description: null,
        citation: { page: 12, quote: "Bilaga 1 Prisbilaga", check: "unverified", found_page: null },
      },
    ],
    evaluation: [
      {
        name: "Pris",
        weight_percent: 70,
        how_assessed: "Lägst pris får högst poäng.",
        citation: { page: 9, quote: "Pris 70 %", check: "verified", found_page: null },
      },
    ],
    dates: [
      {
        kind: "fragestopp",
        date: "2026-10-16",
        description: "Frågor ställs i e-Avrop.",
        citation: { page: 2, quote: "Sista dag för frågor", check: "verified", found_page: null },
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
  documents: [{ id: DOCUMENT_ID, filename: "Förfrågningsunderlag Solbacken.pdf", page_count: 16, is_fictitious: true }],
  checklist: checklistView,
  match: null,
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
    citations: [{ page: 4, quote: "Leverantören ska ha en ansvarsförsäkring", check: "verified", found_page: null }],
    suggest_formal_question: true,
  },
  engine: "heuristic",
  document_id: DOCUMENT_ID,
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
};
