import { describe, expect, it } from "vitest";
import { answerNotInDocument, NOTICE_ID } from "../../test/fixtures";
import {
  historyOf,
  isAnswered,
  isPending,
  latestRulesSession,
  loadConversations,
  nextTurnId,
  noticeScope,
  parseScopeKey,
  questionProblem,
  RULES_SCOPE,
  saveConversations,
  scopeKey,
  STORAGE_KEY,
  type Turn,
} from "./askAiState";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

const answered: Turn = { id: 1, question: "Vilka försäkringar krävs?", answer: answerNotInDocument, rules: null, error: null };
const pending: Turn = { id: 2, question: "Hur stor?", answer: null, rules: null, error: null };
const failed: Turn = { id: 3, question: "Varför?", answer: null, rules: null, error: "AI-tjänsten svarar inte." };

describe("the panel's conversations", () => {
  it("names a conversation by its subject and reads the name back", () => {
    expect(scopeKey(noticeScope(NOTICE_ID))).toBe(`notice:${NOTICE_ID}`);
    expect(scopeKey(RULES_SCOPE)).toBe("rules");
    expect(parseScopeKey(`notice:${NOTICE_ID}`)).toEqual(noticeScope(NOTICE_ID));
    expect(parseScopeKey("rules")).toEqual(RULES_SCOPE);
    expect(parseScopeKey("notice:../etc")).toBeNull();
    expect(parseScopeKey(null)).toBeNull();
  });

  it("keeps only the answered turns in this tab's storage, and reads them back", () => {
    const storage = memoryStorage();
    saveConversations({ rules: [answered, pending, failed], [`notice:${NOTICE_ID}`]: [pending] }, storage);

    const kept = loadConversations(storage);
    expect(Object.keys(kept)).toEqual(["rules"]);
    expect(kept.rules?.map((turn) => turn.id)).toEqual([1]);
    expect(isAnswered(answered) && isPending(pending) && !isPending(failed)).toBe(true);
  });

  it("clears the storage when nothing is left, and shrugs at unreadable storage", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadConversations(storage)).toEqual({});
    storage.setItem(STORAGE_KEY, JSON.stringify({ "notice:x": [{ id: 1 }], rules: "nej" }));
    expect(loadConversations(storage)).toEqual({});
    saveConversations({ rules: [pending] }, storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadConversations(null)).toEqual({});
  });

  it("sends the earlier answered turns as history, oldest first, and continues the rules session", () => {
    expect(historyOf([answered, pending, failed])).toEqual([{ question: answered.question, answer: answerNotInDocument.answer.answer }]);
    const withSession: Turn = {
      ...answered,
      answer: null,
      rules: { answer: { answer: "Svar.", sources: [], session_id: "11111111-2222-4333-8444-555555555555" }, engine: "eneo" },
    };
    expect(latestRulesSession([withSession, pending])).toBe("11111111-2222-4333-8444-555555555555");
    expect(latestRulesSession([answered])).toBeNull();
    expect(nextTurnId({ rules: [answered, failed], other: [] })).toBe(4);
    expect(nextTurnId({})).toBe(1);
  });

  it("says what is wrong with a question before it is sent", () => {
    expect(questionProblem("  ?")).toBe("Skriv en fråga på minst tre tecken.");
    expect(questionProblem("x".repeat(2001))).toBe("Frågan får vara högst 2 000 tecken.");
    expect(questionProblem("Krävs F-skatt?")).toBeNull();
  });
});
