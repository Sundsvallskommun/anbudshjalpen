/**
 * The words of Drift's "AI-användning" (the usage and estimated cost of the AI engine): the period, the one line of
 * sums, what the figures leave out and what the estimate rests on. Pure functions, so the rules are tested without
 * rendering.
 */
import type { AiUsageModelView, AiUsageView } from "../../api/types";
import { formatNumber, formatSekCost, formatSekPrice, plural } from "../../lib/format";
import { engineLabel } from "../../lib/labels";

/** The periods the reader can choose; the backend accepts any number of days up to a year. */
export const PERIODS: readonly { days: number; label: string }[] = [
  { days: 7, label: "7 dagar" },
  { days: 30, label: "30 dagar" },
  { days: 90, label: "90 dagar" },
];

export const DEFAULT_DAYS = 30;

/**
 * One line of the period's sums: "42 anrop · 1 234 567 tokens in · 38 000 tokens ut · uppskattningsvis 14,50 kr". A
 * call the engine did not count is said as "3 anrop utan tokenräkning", so the sums are never read as the whole.
 */
export function summaryLine(view: AiUsageView): string {
  if (view.calls === 0) return `Inga AI-anrop de senaste ${view.days} dagarna.`;
  const parts = [plural(view.calls, "anrop", "anrop")];
  if (view.calls_with_usage > 0) {
    parts.push(`${formatNumber(view.input_tokens)} tokens in`, `${formatNumber(view.output_tokens)} tokens ut`);
    if (view.cost_sek !== null) parts.push(`uppskattningsvis ${formatSekCost(view.cost_sek)}`);
  } else {
    parts.push("inga tokens räknade");
  }
  const uncounted = view.calls - view.calls_with_usage;
  if (uncounted > 0 && view.calls_with_usage > 0) parts.push(`${plural(uncounted, "anrop", "anrop")} utan tokenräkning`);
  return parts.join(" · ");
}

/** What the estimate rests on, or what the operator must set for one to be shown. */
export function priceNote(view: Pick<AiUsageView, "price_input_sek_per_million" | "price_output_sek_per_million">): string {
  if (view.price_input_sek_per_million === null || view.price_output_sek_per_million === null) {
    return (
      "Ingen kostnad kan uppskattas förrän priset är satt: AI_PRICE_INPUT_SEK_PER_MILLION och " +
      "AI_PRICE_OUTPUT_SEK_PER_MILLION, kronor per miljon tokens."
    );
  }
  return `Uppskattningen utgår från ${formatSekPrice(view.price_input_sek_per_million)} per miljon tokens in och ${formatSekPrice(view.price_output_sek_per_million)} per miljon tokens ut.`;
}

/** Why an engine's calls carry no tokens; null for an engine that counts (an OpenAI-compatible endpoint). */
export function engineNote(engine: string): string | null {
  if (engine === "heuristic") return "Den regelbaserade motorn använder ingen språkmodell, så inga tokens räknas.";
  if (engine === "eneo") {
    return "Eneo lämnar inte ut tokenräkningen till Anbudshjälpen ännu, så anropen till Eneo räknas utan tokens och kostnad.";
  }
  return null;
}

/** "Modell: GPT X · 12 anrop", or several: "Modeller: GPT X (12 anrop), regelbaserad motor (3 anrop)". */
export function modelsLine(models: readonly AiUsageModelView[]): string | null {
  if (models.length === 0) return null;
  const name = (item: AiUsageModelView) => item.model ?? engineLabel(item.engine);
  if (models.length === 1) return `Modell: ${name(models[0]!)} · ${plural(models[0]!.calls, "anrop", "anrop")}`;
  return `Modeller: ${models.map((item) => `${name(item)} (${plural(item.calls, "anrop", "anrop")})`).join(", ")}`;
}
