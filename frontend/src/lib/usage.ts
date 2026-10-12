/**
 * The words for what one answer cost the language model (`TokenUsageView`), said once in the provenance popover.
 * Pure, so the sentence is tested without rendering.
 */
import type { TokenUsageView } from "../api/types";
import { formatNumber, formatSekCost } from "./format";

/**
 * "Språkmodellen använde 9 400 tokens för det här: 8 950 in och 450 ut. Uppskattad kostnad 0,12 kr." The cost is
 * left out while no price is set.
 */
export function usageLine(usage: TokenUsageView): string {
  const total = usage.input_tokens + usage.output_tokens;
  const counts = `Språkmodellen använde ${formatNumber(total)} tokens för det här: ${formatNumber(usage.input_tokens)} in och ${formatNumber(usage.output_tokens)} ut.`;
  return usage.cost_sek === null ? counts : `${counts} Uppskattad kostnad ${formatSekCost(usage.cost_sek)}.`;
}
