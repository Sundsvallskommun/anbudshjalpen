import { describe, expect, it } from "vitest";
import type { AiUsageView } from "../../api/types";
import { formatNumber, formatSekCost, formatSekPrice } from "../../lib/format";
import { engineNote, modelsLine, priceNote, summaryLine } from "./aiUsage";

const month: AiUsageView = {
  since: "2026-09-12T12:00:00Z",
  until: "2026-10-12T12:00:00Z",
  days: 30,
  calls: 5,
  calls_with_usage: 4,
  input_tokens: 130_000,
  output_tokens: 5_000,
  cost_sek: 4.5,
  price_input_sek_per_million: 30,
  price_output_sek_per_million: 120,
  by_task: [],
  by_model: [
    { engine: "openai", model: "gpt-x", calls: 4, calls_with_usage: 4, input_tokens: 130_000, output_tokens: 5_000, cost_sek: 4.5 },
    { engine: "heuristic", model: null, calls: 1, calls_with_usage: 0, input_tokens: 0, output_tokens: 0, cost_sek: null },
  ],
};

describe("summaryLine", () => {
  it("sums the period on one line and says which calls the sums leave out", () => {
    expect(summaryLine(month)).toBe(
      `5 anrop · ${formatNumber(130_000)} tokens in · ${formatNumber(5_000)} tokens ut · uppskattningsvis ${formatSekCost(4.5)} · 1 anrop utan tokenräkning`,
    );
  });

  it("leaves the cost out without a price, and the tokens out when nothing was counted", () => {
    expect(summaryLine({ ...month, cost_sek: null, calls_with_usage: 5 })).toBe(
      `5 anrop · ${formatNumber(130_000)} tokens in · ${formatNumber(5_000)} tokens ut`,
    );
    expect(summaryLine({ ...month, calls: 3, calls_with_usage: 0, input_tokens: 0, output_tokens: 0, cost_sek: null })).toBe(
      "3 anrop · inga tokens räknade",
    );
    expect(summaryLine({ ...month, calls: 0, calls_with_usage: 0 })).toBe("Inga AI-anrop de senaste 30 dagarna.");
  });
});

describe("priceNote", () => {
  it("names the prices the estimate rests on, or what to set", () => {
    expect(priceNote(month)).toBe(
      `Uppskattningen utgår från ${formatSekPrice(30)} per miljon tokens in och ${formatSekPrice(120)} per miljon tokens ut.`,
    );
    expect(formatSekPrice(30)).toMatch(/^30\skr$/u); // no decimals on a whole price
    expect(priceNote({ price_input_sek_per_million: 30, price_output_sek_per_million: null })).toMatch(
      /^Ingen kostnad kan uppskattas förrän priset är satt: AI_PRICE_INPUT_SEK_PER_MILLION/u,
    );
  });
});

describe("engineNote and modelsLine", () => {
  it("explains why some engines count no tokens", () => {
    expect(engineNote("heuristic")).toMatch(/ingen språkmodell/u);
    expect(engineNote("eneo")).toMatch(/Eneo lämnar inte ut tokenräkningen/u);
    expect(engineNote("openai")).toBeNull();
  });

  it("names the models, with the engine's words for one without a model name", () => {
    expect(modelsLine(month.by_model)).toBe("Modeller: gpt-x (4 anrop), regelbaserad motor (1 anrop)");
    expect(modelsLine([month.by_model[0]!])).toBe("Modell: gpt-x · 4 anrop");
    expect(modelsLine([])).toBeNull();
  });
});
