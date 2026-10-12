import { describe, expect, it } from "vitest";
import { formatNumber, formatSekCost } from "./format";
import { usageLine } from "./usage";

describe("usageLine", () => {
  it("says the tokens in and out, and the estimate when a price is set", () => {
    expect(usageLine({ input_tokens: 8950, output_tokens: 450, cost_sek: 0.12 })).toBe(
      `Språkmodellen använde ${formatNumber(9400)} tokens för det här: ${formatNumber(8950)} in och 450 ut. Uppskattad kostnad ${formatSekCost(0.12)}.`,
    );
  });

  it("leaves the cost out while no price is set", () => {
    expect(usageLine({ input_tokens: 120, output_tokens: 30, cost_sek: null })).toBe(
      "Språkmodellen använde 150 tokens för det här: 120 in och 30 ut.",
    );
  });
});
