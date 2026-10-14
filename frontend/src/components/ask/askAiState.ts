/**
 * The "Fråga AI" panel's conversations (decision 0014): one per place, a notice's page or everywhere else, kept in
 * the browser's session storage so they follow the reader between pages and survive a reload. Only each question
 * reaches the server, and the storage is this tab's own: it goes when the tab closes. Which subject answers a turn,
 * the documents, the rules or the company's profile, is the backend's choice (decision 0026), so a conversation on a
 * notice page mixes answers from the documents with answers about the rules. Pure functions, so the rules are tested
 * without rendering.
 */
import type { AnswerView, AskTurnIn, ProfileChatView, RulesView, Subject } from "../../api/types";

/** Where a conversation is held: on one notice's page, or anywhere else in the app. */
export type AskPlace = { kind: "notice"; noticeId: string } | { kind: "general" };

export const GENERAL_PLACE: AskPlace = { kind: "general" };

export function noticePlace(noticeId: string): AskPlace {
  return { kind: "notice", noticeId };
}

/** The key a conversation is kept under, and the address parameter of the print view: "notice:<id>" or "general". */
export function placeKey(place: AskPlace): string {
  return place.kind === "notice" ? `notice:${place.noticeId}` : "general";
}

const NOTICE_KEY = /^notice:([0-9a-f-]{36})$/u;
/** Conversations kept before decision 0026, one per subject; both now live in the general conversation. */
const OLD_GENERAL_KEYS = new Set(["rules", "profile"]);

export function parsePlaceKey(key: string | null | undefined): AskPlace | null {
  if (!key) return null;
  if (key === "general" || OLD_GENERAL_KEYS.has(key)) return GENERAL_PLACE;
  const match = NOTICE_KEY.exec(key);
  return match?.[1] ? noticePlace(match[1]) : null;
}

/** One question in a conversation and what came of it: exactly one of the three answers, once it has come. */
export interface Turn {
  id: number;
  question: string;
  /** The answer about a notice's documents. */
  answer: AnswerView | null;
  /** The answer from Regelhjälpen. */
  rules: RulesView | null;
  /** What a message to the profile came to. */
  profile: ProfileChatView | null;
  /** Why the question could not be answered, in the reader's words; such a turn stays so it can be asked again. */
  error: string | null;
}

export type Conversations = Record<string, Turn[]>;

export const STORAGE_KEY = "anbudsklar.fraga-ai.v1";
/** How many turns a conversation keeps: the storage is small and nobody reads back further. */
export const MAX_TURNS = 40;
/** How many earlier turns go with a question, as the backend's limit. */
export const HISTORY_TURNS = 10;
const HISTORY_ANSWER_CHARS = 8000;

/** The subject that answered a turn, or null while the answer is on its way. */
export function subjectOf(turn: Turn): Subject | null {
  if (turn.answer) return "underlag";
  if (turn.rules) return "regler";
  return turn.profile ? "profil" : null;
}

export function isAnswered(turn: Turn): boolean {
  return subjectOf(turn) !== null;
}

export function isPending(turn: Turn): boolean {
  return !isAnswered(turn) && turn.error === null;
}

export function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked storage, a private window or no window at all
  }
}

function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return typeof turn.id === "number" && typeof turn.question === "string" && "answer" in turn && "rules" in turn;
}

/**
 * The conversations kept in this tab; anything unreadable counts as none. The conversations about the rules and
 * the profile from before decision 0026 become the general conversation, in the order they were asked.
 */
export function loadConversations(storage: Storage | null = sessionStorageOrNull()): Conversations {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const conversations: Conversations = {};
    for (const [key, turns] of Object.entries(parsed as Record<string, unknown>)) {
      const place = parsePlaceKey(key);
      if (!place || !Array.isArray(turns)) continue;
      // A turn kept before the profile could be a subject has no `profile`.
      const read = turns.filter(isTurn).map((turn) => ({ ...turn, profile: turn.profile ?? null, error: null }));
      const into = placeKey(place);
      conversations[into] = [...(conversations[into] ?? []), ...read].sort((a, b) => a.id - b.id);
    }
    return conversations;
  } catch {
    return {};
  }
}

/** Keeps the answered turns: a question on its way or one that failed is not worth a reload. */
export function saveConversations(conversations: Conversations, storage: Storage | null = sessionStorageOrNull()) {
  try {
    const kept: Conversations = {};
    for (const [key, turns] of Object.entries(conversations)) {
      const answered = turns.filter(isAnswered).slice(-MAX_TURNS);
      if (answered.length > 0) kept[key] = answered;
    }
    if (Object.keys(kept).length === 0) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Full or blocked storage: the conversation still lives in memory for this page.
  }
}

/** The words of a turn's answer, whichever subject gave it. */
function answerText(turn: Turn): string {
  return turn.answer?.answer.answer ?? turn.rules?.answer.answer ?? turn.profile?.reply ?? "";
}

/**
 * The earlier answered turns sent with a question, oldest first, each with the subject that answered it: the backend
 * uses them to keep a follow-up with its subject, and gives each subject's task only its own turns.
 */
export function historyOf(turns: readonly Turn[]): AskTurnIn[] {
  return turns
    .filter(isAnswered)
    .slice(-HISTORY_TURNS)
    .map((turn) => ({
      question: turn.question,
      answer: answerText(turn).slice(0, HISTORY_ANSWER_CHARS),
      subject: subjectOf(turn) ?? "regler",
    }));
}

/** The engine's conversation to continue in Regelhjälpen: the latest answer's session, when it gave one. */
export function latestRulesSession(turns: readonly Turn[]): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const sessionId = turns[index]?.rules?.answer.session_id;
    if (sessionId) return sessionId;
  }
  return null;
}

/** An id no turn in any conversation has. */
export function nextTurnId(conversations: Conversations): number {
  let highest = 0;
  for (const turns of Object.values(conversations)) {
    for (const turn of turns) highest = Math.max(highest, turn.id);
  }
  return highest + 1;
}

export const MAX_QUESTION_LENGTH = 2000;
export const MIN_QUESTION_LENGTH = 3;

/** Why a question cannot be sent, in words for the field, or null when it can. */
export function questionProblem(text: string): string | null {
  const length = text.trim().length;
  if (length < MIN_QUESTION_LENGTH) return "Skriv en fråga på minst tre tecken.";
  if (length > MAX_QUESTION_LENGTH) return "Frågan får vara högst 2 000 tecken.";
  return null;
}
