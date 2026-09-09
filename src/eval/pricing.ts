// ============================================================================
// LegalCiteEval — token pricing (for the inference-cost line).
//
// USD per 1M tokens, input / output. ILLUSTRATIVE public list prices, used only
// to turn token usage into a rough dollar estimate; they drift, so the number
// is an order-of-magnitude signal, not a billing figure. An unknown model
// yields no dollar estimate (tokens are still reported).
// ============================================================================

import type { CostSummary, TokenUsage } from "../types.js";

interface Price {
  inputPerM: number;
  outputPerM: number;
}

const PRICES: Record<string, Price> = {
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4.1": { inputPerM: 2, outputPerM: 8 },
  "gpt-4.1-mini": { inputPerM: 0.4, outputPerM: 1.6 },
  "gpt-4.1-nano": { inputPerM: 0.1, outputPerM: 0.4 },
};

function priceFor(model: string | undefined): Price | undefined {
  if (model === undefined) return undefined;
  return PRICES[model] ?? PRICES[model.replace(/^openai\//, "")];
}

/**
 * Aggregate per-question usage into a cost summary. Returns undefined when no
 * question reported usage. `estimatedUsd` is included only when the model price
 * is known.
 */
export function summarizeCost(
  model: string | undefined,
  usages: TokenUsage[],
): CostSummary | undefined {
  if (usages.length === 0) return undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const u of usages) {
    promptTokens += u.promptTokens;
    completionTokens += u.completionTokens;
  }
  const summary: CostSummary = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
  const price = priceFor(model);
  if (price) {
    summary.estimatedUsd =
      (promptTokens / 1_000_000) * price.inputPerM +
      (completionTokens / 1_000_000) * price.outputPerM;
  }
  return summary;
}
