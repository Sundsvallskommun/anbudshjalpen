import { describe, expect, it } from "vitest";
import { answerNotInDocument, NOTICE_ID, profileChatView } from "../../test/fixtures";
import {
  GENERAL_PLACE,
  historyOf,
  isAnswered,
  isPending,
  latestRulesSession,
  loadConversations,
  nextTurnId,
  noticePlace,
  parsePlaceKey,
  placeKey,
  questionProblem,
  saveConversations,
  STORAGE_KEY,
  subjectOf,
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

const answered: Turn = { id: 1, question: "Vilka försäkringar krävs?", answer: answerNotInDocument, rules: null, profile: null, error: null };
const pending: Turn = { id: 2, question: "Hur stor?", answer: null, rules: null, profile: null, error: null };
const failed: Turn = { id: 3, question: "Varför?", answer: null, rules: null, profile: null, error: "AI-tjänsten svarar inte." };
const SESSION = "11111111-2222-4333-8444-555555555555";
const fromRules: Turn = {
  id: 4,
  question: "Hur lång är avtalsspärren?",
  answer: null,
  rules: { answer: { answer: "Tio dagar.", sources: [], session_id: SESSION }, engine: "eneo" },
  profile: null,
  error: null,
};
const fromProfile: Turn = { id: 5, question: "Vi har numera tolv anställda", answer: null, rules: null, profile: profileChatView, error: null };

describe("the panel's conversations", () => {
  it("names a conversation by where it is held, and reads the name back", () => {
    expect(placeKey(noticePlace(NOTICE_ID))).toBe(`notice:${NOTICE_ID}`);
    expect(placeKey(GENERAL_PLACE)).toBe("general");
    expect(parsePlaceKey(`notice:${NOTICE_ID}`)).toEqual(noticePlace(NOTICE_ID));
    expect(parsePlaceKey("general")).toEqual(GENERAL_PLACE);
    // The names from before decision 0026, one conversation per subject, are the general conversation now.
    expect(parsePlaceKey("rules")).toEqual(GENERAL_PLACE);
    expect(parsePlaceKey("profile")).toEqual(GENERAL_PLACE);
    expect(parsePlaceKey("notice:../etc")).toBeNull();
    expect(parsePlaceKey(null)).toBeNull();
  });

  it("keeps only the answered turns in this tab's storage, and reads them back", () => {
    const storage = memoryStorage();
    saveConversations({ general: [answered, pending, failed], [`notice:${NOTICE_ID}`]: [pending] }, storage);

    const kept = loadConversations(storage);
    expect(Object.keys(kept)).toEqual(["general"]);
    expect(kept.general?.map((turn) => turn.id)).toEqual([1]);
    expect(isAnswered(answered) && isPending(pending) && !isPending(failed)).toBe(true);
  });

  it("merges the conversations about the rules and the profile kept before decision 0026, in the order asked", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ profile: [fromProfile], rules: [answered, fromRules] }));
    const kept = loadConversations(storage);
    expect(Object.keys(kept)).toEqual(["general"]);
    expect(kept.general?.map((turn) => turn.id)).toEqual([1, 4, 5]);
  });

  it("clears the storage when nothing is left, and shrugs at unreadable storage", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadConversations(storage)).toEqual({});
    storage.setItem(STORAGE_KEY, JSON.stringify({ "notice:x": [{ id: 1 }], general: "nej" }));
    expect(loadConversations(storage)).toEqual({});
    saveConversations({ general: [pending] }, storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadConversations(null)).toEqual({});
  });

  it("knows which subject answered a turn", () => {
    expect([answered, fromRules, fromProfile, pending].map(subjectOf)).toEqual(["underlag", "regler", "profil", null]);
  });

  it("sends the earlier answered turns as history with their subjects, oldest first, and continues the rules session", () => {
    expect(historyOf([answered, pending, fromRules, failed, fromProfile])).toEqual([
      { question: answered.question, answer: answerNotInDocument.answer.answer, subject: "underlag" },
      { question: fromRules.question, answer: "Tio dagar.", subject: "regler" },
      { question: fromProfile.question, answer: profileChatView.reply, subject: "profil" },
    ]);
    expect(latestRulesSession([fromRules, pending])).toBe(SESSION);
    expect(latestRulesSession([answered])).toBeNull();
    expect(nextTurnId({ general: [answered, failed], other: [] })).toBe(4);
    expect(nextTurnId({})).toBe(1);
  });

  it("says what is wrong with a question before it is sent", () => {
    expect(questionProblem("  ?")).toBe("Skriv en fråga på minst tre tecken.");
    expect(questionProblem("x".repeat(2001))).toBe("Frågan får vara högst 2 000 tecken.");
    expect(questionProblem("Krävs F-skatt?")).toBeNull();
  });
});
