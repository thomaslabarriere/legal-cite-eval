// ============================================================================
// LegalCiteEval — scorecard aggregation and rendering.
//
// Rolls per-question results into a weighted reliability score and per-metric
// failure rates, and renders a plain-unicode terminal report. The reliability
// score is normalized by the weight of the metrics that were actually
// applicable, so questions are not penalized on metrics that did not apply.
// ============================================================================

import type {
  CostSummary,
  JudgeCalibration,
  LatencySummary,
  MetricKey,
  QuestionResult,
  Scorecard,
  TokenUsage,
} from "../types.js";
import { METRIC_WEIGHT } from "../types.js";
import { summarizeCost } from "./pricing.js";

/** Stable display / iteration order for metrics. */
const METRIC_ORDER: readonly MetricKey[] = [
  "hallucinated_citation",
  "irrelevant_citation",
  "unsupported_claim",
  "missed_authority",
  "missed_retrieval",
  "agent_error",
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function summarizeLatency(results: QuestionResult[]): LatencySummary | undefined {
  const latencies = results
    .map((r) => r.stats?.latencyMs)
    .filter((v): v is number => v !== undefined);
  if (latencies.length === 0) return undefined;
  const totalMs = latencies.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / latencies.length;
  return {
    totalMs,
    avgMs,
    throughputPerSec: totalMs > 0 ? (latencies.length / totalMs) * 1000 : 0,
  };
}

export interface BuildScorecardOptions {
  judgeCalibration?: JudgeCalibration;
  ragMode?: boolean;
}

export function buildScorecard(
  agentName: string,
  model: string | undefined,
  results: QuestionResult[],
  options: BuildScorecardOptions = {},
): Scorecard {
  const { judgeCalibration, ragMode } = options;
  const totalQuestions = results.length;
  const passed = results.filter((r) => r.passed).length;

  const fired = new Map<MetricKey, number>();
  const applicable = new Map<MetricKey, number>();

  let failedWeight = 0;
  let applicableWeight = 0;

  for (const result of results) {
    for (const metric of result.applicableMetrics) {
      applicable.set(metric, (applicable.get(metric) ?? 0) + 1);
      applicableWeight += METRIC_WEIGHT[metric];
    }
    for (const metric of result.failures) {
      fired.set(metric, (fired.get(metric) ?? 0) + 1);
      failedWeight += METRIC_WEIGHT[metric];
    }
  }

  // agent_error applies to every question (it is not per-question applicable,
  // it is a whole-run guard), so force its applicable count.
  applicable.set("agent_error", totalQuestions);

  // Rate for every APPLICABLE metric (so a metric that was checked and passed
  // shows 0%, distinct from a metric that was never applicable → left "-").
  const rates: Partial<Record<MetricKey, number>> = {};
  for (const [metric, applicableCount] of applicable) {
    if (applicableCount > 0) {
      rates[metric] = (fired.get(metric) ?? 0) / applicableCount;
    }
  }

  const reliabilityScore =
    applicableWeight === 0
      ? 100
      : Math.round(
          clamp(100 * (1 - failedWeight / applicableWeight), 0, 100),
        );

  const usages: TokenUsage[] = results
    .map((r) => r.stats?.usage)
    .filter((u): u is TokenUsage => u !== undefined);
  const cost: CostSummary | undefined = summarizeCost(model, usages);
  const latency = summarizeLatency(results);

  return {
    agentName,
    ...(model !== undefined ? { model } : {}),
    totalQuestions,
    passed,
    reliabilityScore,
    rates,
    perQuestion: results,
    ...(judgeCalibration !== undefined ? { judgeCalibration } : {}),
    ...(ragMode !== undefined ? { ragMode } : {}),
    ...(cost !== undefined ? { cost } : {}),
    ...(latency !== undefined ? { latency } : {}),
  };
}

export function renderScorecard(sc: Scorecard): string {
  const lines: string[] = [];
  const rule = "─".repeat(60);

  lines.push(rule);
  lines.push(`LegalCiteEval — ${sc.agentName}`);
  if (sc.model !== undefined) lines.push(`Model: ${sc.model}`);
  if (sc.ragMode) lines.push("Mode: RAG (retrieve-then-cite)");
  lines.push(rule);
  lines.push(
    `Reliability score: ${sc.reliabilityScore}/100   ` +
      `Passed: ${sc.passed}/${sc.totalQuestions}`,
  );
  lines.push("");

  // Per-question results.
  lines.push("Questions");
  for (const q of sc.perQuestion) {
    const mark = q.passed ? "✓" : "✗";
    const detail =
      q.failures.length > 0 ? `  [${q.failures.join(", ")}]` : "";
    lines.push(`  ${mark} ${q.questionId} — ${q.title}${detail}`);
  }
  lines.push("");

  // Metric rate table.
  lines.push("Metric rates (fired / applicable)");
  const nameWidth = Math.max(
    ...METRIC_ORDER.map((m) => m.length),
    "metric".length,
  );
  lines.push(`  ${"metric".padEnd(nameWidth)}   rate`);
  for (const metric of METRIC_ORDER) {
    const rate = sc.rates[metric];
    const cell =
      rate === undefined ? "-" : `${(rate * 100).toFixed(0)}%`;
    lines.push(`  ${metric.padEnd(nameWidth)}   ${cell}`);
  }

  // Inference cost + latency section. Cost appears only when the agent
  // reported token usage (real-model runs); latency appears whenever it is
  // meaningful. A deterministic agent runs effectively instantly (sub-ms),
  // where per-second throughput is noise, so that case is reported plainly
  // instead of as a misleading "0.00 questions/s".
  const showLatency = sc.latency !== undefined && sc.latency.avgMs >= 1;
  if (sc.cost !== undefined || showLatency) {
    lines.push("");
    lines.push("Cost & latency");
    if (sc.cost !== undefined) {
      const c = sc.cost;
      lines.push(
        `  Tokens: ${c.totalTokens} (prompt ${c.promptTokens} / completion ${c.completionTokens})`,
      );
      lines.push(
        c.estimatedUsd !== undefined
          ? `  Est. cost: $${c.estimatedUsd.toFixed(4)} (illustrative list price, agent only)`
          : "  Est. cost: n/a (unknown model price)",
      );
    }
    if (showLatency && sc.latency !== undefined) {
      const l = sc.latency;
      lines.push(
        `  Latency: ${(l.avgMs / 1000).toFixed(2)}s/question avg ` +
          `(${(l.totalMs / 1000).toFixed(2)}s total)`,
      );
      lines.push(`  Throughput: ${l.throughputPerSec.toFixed(2)} questions/s`);
    }
  }

  // Judge calibration section.
  if (sc.judgeCalibration !== undefined) {
    const jc = sc.judgeCalibration;
    lines.push("");
    lines.push("Judge calibration");
    lines.push(`  Judge: ${jc.judgeName}`);
    lines.push(
      `  Agreement rate: ${(jc.agreementRate * 100).toFixed(0)}% ` +
        `(${jc.agree}/${jc.total})`,
    );
    lines.push(`  False positives: ${jc.falsePositive}`);
    lines.push(`  False negatives: ${jc.falseNegative}`);
  }

  lines.push(rule);
  return lines.join("\n");
}
