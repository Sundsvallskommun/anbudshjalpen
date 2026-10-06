import { describe, expect, it } from "vitest";
import type { RuleSource, RulesView } from "../../api/types";
import {
  isLawSource,
  latestSessionId,
  needsSourceWarning,
  parseRulesAnswer,
  questionError,
  sourcesHeading,
  sourceTitle,
  splitFirstSentence,
} from "./rulesAnswer";

const spärr: RuleSource = {
  title: "Avtalsspärr",
  reference: "LOU 20 kap. 1 §",
  url: "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K20P1",
  excerpt: "Om underrättelsen har skickats med ett elektroniskt medel får avtal inte ingås förrän 10 dagar har gått. …",
};
const förlängd: RuleSource = {
  title: "Förlängd avtalsspärr",
  reference: "LOU 20 kap. 8 §",
  url: "https://data.riksdagen.se/dokument/sfs-2016-1145.html#K20P8",
  excerpt: "Om en ansökan om överprövning har gjorts, fortsätter avtalsspärren att gälla.",
};

function view(answer: string, sources: RuleSource[], engine = "heuristic", sessionId: string | null = null): RulesView {
  return { answer: { answer, sources, session_id: sessionId }, engine };
}

describe("parseRulesAnswer", () => {
  it("drops the rule-based engine's repetition of the paragraphs and keeps its introduction for the cards", () => {
    const text = [
      "Paragrafer som kan handla om din fråga:",
      `LOU 20 kap. 1 § – Avtalsspärr: ${spärr.excerpt}`,
      `LOU 20 kap. 8 § – Förlängd avtalsspärr: ${förlängd.excerpt}`,
    ].join("\n\n");
    const parts = parseRulesAnswer({ answer: text, sources: [spärr, förlängd] });
    expect(parts).toEqual({ lead: null, body: "", sourcesIntro: "Paragrafer som kan handla om din fråga:" });
    // A heading over the cards, so without the engine's colon.
    expect(sourcesHeading(parts)).toBe("Paragrafer som kan handla om din fråga");
  });

  it("takes a language model's first sentence as the lead and keeps the rest, lists included, as the explanation", () => {
    const text =
      "**Avtalsspärren är 10 dagar om underrättelsen skickas elektroniskt, annars 15 dagar.** Under tiden får avtal " +
      "inte tecknas (LOU 20 kap. 1 §).\n\n- Spärren börjar när underrättelsen skickas.\n- Den förlängs vid överprövning.";
    const parts = parseRulesAnswer({ answer: text, sources: [spärr] });
    expect(parts.lead).toBe("Avtalsspärren är 10 dagar om underrättelsen skickas elektroniskt, annars 15 dagar.");
    expect(parts.body).toBe(
      "Under tiden får avtal inte tecknas (LOU 20 kap. 1 §).\n\n- Spärren börjar när underrättelsen skickas.\n- Den förlängs vid överprövning.",
    );
    expect(sourcesHeading(parts)).toBe("Svaret bygger på");
  });

  it("does not end the lead at a chapter abbreviation, and keeps a list under the first line a list", () => {
    expect(splitFirstSentence("Enligt 20 kap. 1 § LOU gäller spärren. Mer text.")).toEqual({
      first: "Enligt 20 kap. 1 § LOU gäller spärren.",
      rest: "Mer text.",
    });
    const parts = parseRulesAnswer({ answer: "Det finns tre steg:\n1. Läs underlaget.\n2. Ställ frågor.", sources: [] });
    expect(parts.lead).toBe("Det finns tre steg:");
    expect(parts.body).toBe("1. Läs underlaget.\n2. Ställ frågor.");
  });

  it("gives no lead to an answer that opens with a list", () => {
    expect(parseRulesAnswer({ answer: "- Ett\n- Två", sources: [] })).toEqual({
      lead: null,
      body: "- Ett\n- Två",
      sourcesIntro: null,
    });
  });

  it("reads the rule-based engine's answer when no rule matched as a lead and a follow-up", () => {
    const parts = parseRulesAnswer({
      answer: "Ingen regeltext verkar handla om frågan. Fråga gärna kommunens inköpsavdelning.",
      sources: [],
    });
    expect(parts).toEqual({
      lead: "Ingen regeltext verkar handla om frågan.",
      body: "Fråga gärna kommunens inköpsavdelning.",
      sourcesIntro: null,
    });
  });
});

describe("the answer's sources", () => {
  it("names a paragraph by its reference and title, and tells the law from other sources", () => {
    expect(sourceTitle(spärr)).toBe("LOU 20 kap. 1 § · Avtalsspärr");
    expect(sourceTitle({ reference: null, title: "Upphandlingsmyndigheten: Lämna anbud" })).toBe(
      "Upphandlingsmyndigheten: Lämna anbud",
    );
    expect(sourceTitle({ reference: "LOU 4 kap. 1 §", title: "LOU 4 kap. 1 §" })).toBe("LOU 4 kap. 1 §");
    expect(isLawSource(spärr)).toBe(true);
    expect(isLawSource({ reference: null })).toBe(false);
  });

  it("flags a language model's answer without sources, not the rule-based engine's", () => {
    expect(needsSourceWarning(view("Svar utan källa.", [], "eneo"))).toBe(true);
    expect(needsSourceWarning(view("Ingen regeltext verkar handla om frågan.", [], "heuristic"))).toBe(false);
    expect(needsSourceWarning(view("Svar.", [spärr], "eneo"))).toBe(false);
  });
});

describe("the conversation", () => {
  it("checks a question's length before it is sent", () => {
    expect(questionError("  ")).toBe("Skriv en fråga på minst tre tecken");
    expect(questionError("Hej")).toBeNull();
    expect(questionError("x".repeat(2001))).toBe("Frågan får vara högst 2\u00a0000 tecken");
  });

  it("continues the latest conversation the engine started", () => {
    expect(latestSessionId([])).toBeNull();
    expect(latestSessionId([view("a", [], "eneo", "s1"), null, view("b", [], "heuristic")])).toBe("s1");
    expect(latestSessionId([view("a", [], "eneo", "s1"), view("b", [], "eneo", "s2")])).toBe("s2");
  });
});
