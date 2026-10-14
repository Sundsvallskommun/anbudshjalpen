/**
 * The "Fråga AI" panel's conversations (decision 0014): one per subject, a notice or the rules, kept in the browser's
 * session storage so they follow the reader between pages and survive a reload. Only each question reaches the server,
 * and the storage is this tab's own: it goes when the tab closes. Pure functions, so the rules are tested without
 * rendering.
 */
import type { AnswerView, QuestionTurnIn, RulesView } from "../../api/types";

/** What a conversation is about: one notice's documents, or the rules of procurement (Regelhjälpen). */
export type AskScope = { kind: "notice"; noticeId: string } | { kind: "rules" };

export const RULES_SCOPE: AskScope = { kind: "rules" };

export function noticeScope(noticeId: string): AskScope {
  return { kind: "notice", noticeId };
}

export function sameScope(a: AskScope, b: AskScope): boolean {
  return scopeKey(a) === scopeKey(b);
}

/** The key a conversation is kept under, and the address parameter of the print view: "notice:<id>" or "rules". */
export function scopeKey(scope: AskScope): string {
  return scope.kind === "notice" ? `notice:${scope.noticeId}` : "rules";
}

const NOTICE_KEY = /^notice:([0-9a-f-]{36})$/u;

export function parseScopeKey(key: string | null | undefined): AskScope | null {
  if (!key) return null;
  if (key === "rules") return RULES_SCOPE;
  const match = NOTICE_KEY.exec(key);
  return match?.[1] ? noticeScope(match[1]) : null;
}

/** One question in a conversation and what came of it. */
export interface Turn {
  id: number;
  question: string;
  /** The answer about a notice's documents, once it has come. */
  answer: AnswerView | null;
  /** The answer from Regelhjälpen, once it has come. */
  rules: RulesView | null;
  /** Why the question could not be answered, in the reader's words; such a turn stays so it can be asked again. */
  error: string | null;
}

export type Conversations = Record<string, Turn[]>;

export const STORAGE_KEY = "anbudsklar.fraga-ai.v1";
/** How many turns a conversation keeps: the storage is small and nobody reads back further. */
export const MAX_TURNS = 40;
/** How many earlier turns go with a question about a notice, as the backend's limit. */
export const HISTORY_TURNS = 10;
const HISTORY_ANSWER_CHARS = 8000;

export function isAnswered(turn: Turn): boolean {
  return turn.answer !== null || turn.rules !== null;
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

/** The conversations kept in this tab; anything unreadable counts as none. */
export function loadConversations(storage: Storage | null = sessionStorageOrNull()): Conversations {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const conversations: Conversations = {};
    for (const [key, turns] of Object.entries(parsed as Record<string, unknown>)) {
      if (parseScopeKey(key) && Array.isArray(turns)) {
        conversations[key] = turns.filter(isTurn).map((turn) => ({ ...turn, error: null }));
      }
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

/** The earlier turns sent with a question about a notice, oldest first, as the backend expects them. */
export function historyOf(turns: readonly Turn[]): QuestionTurnIn[] {
  return turns
    .filter((turn): turn is Turn & { answer: AnswerView } => turn.answer !== null)
    .slice(-HISTORY_TURNS)
    .map((turn) => ({ question: turn.question, answer: turn.answer.answer.answer.slice(0, HISTORY_ANSWER_CHARS) }));
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

// --- The welcome ---------------------------------------------------------------------------------

/**
 * Who has been welcomed in this browser: the panel opens by itself with its welcome once per user, and once for a
 * visitor, and never again on a later login. Kept in local storage and on this device only, because the demo's
 * personas are shared: a flag on the user in the database would welcome only the first workshop participant who
 * logs in as Anna.
 */
export const WELCOMED_KEY = "anbudsklar.fraga-ai.valkomnad.v1";
/** The welcome key for someone who has not logged in. */
export const VISITOR = "besokare";

export function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage, a private window or no window at all
  }
}

function welcomed(storage: Storage | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(WELCOMED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Whether the panel has already welcomed this user (an id) or a visitor (`VISITOR`) in this browser. */
export function hasBeenWelcomed(who: string, storage: Storage | null = localStorageOrNull()): boolean {
  return welcomed(storage).includes(who);
}

/** Remembers the welcome. Without storage the panel would open on every page load, so it then counts as given. */
export function markWelcomed(who: string, storage: Storage | null = localStorageOrNull()) {
  try {
    const known = welcomed(storage);
    if (!known.includes(who)) storage?.setItem(WELCOMED_KEY, JSON.stringify([...known, who].slice(-50)));
  } catch {
    // Full or blocked storage: the welcome is simply not remembered.
  }
}

/** The panel's first message: who it is, that it is there through the whole process, and what it can answer. */
export function welcomeText(firstName: string | null): string {
  const greeting = firstName ? `Hej ${firstName}!` : "Hej!";
  return (
    `${greeting} Jag är Anbudshjälpens AI-stöd. Jag finns alltid här i hörnet, genom hela processen: när du läser ` +
    "kraven, granskar ditt utkast och lämnar in. Fråga mig om underlaget i en upphandling eller om reglerna för " +
    "offentlig upphandling."
  );
}
