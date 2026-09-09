// ============================================================================
// LegalCiteEval — scorecard aggregation and rendering.
//
// Rolls per-question results into a weighted reliability score and per-metric
// failure rates, and renders a plain-unicode terminal report. The reliability
// score is normalized by the weight of the metrics that were actually
// applicable, so questions are not penalized on metrics that did not apply.
// ============================================================================

import type {
  JudgeCalibration,
  MetricKey,
  QuestionResult,
  Scorecard,
} from "../types.js";
import { METRIC_WEIGHT } from "../types.js";

/** Stable display / iteration order for metrics. */
const METRIC_ORDER: readonly MetricKey[] = [
  "hallucinated_citation",
  "irrelevant_citation",
  "unsupported_claim",
  "missed_authority",
  "agent_error",
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function buildScorecard(
  agentName: string,
  model: string | undefined,
  results: QuestionResult[],
  judgeCalibration?: JudgeCalibration,
): Scorecard {
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

  return {
    agentName,
    ...(model !== undefined ? { model } : {}),
    totalQuestions,
    passed,
    reliabilityScore,
    rates,
    perQuestion: results,
    ...(judgeCalibration !== undefined ? { judgeCalibration } : {}),
  };
}

export function renderScorecard(sc: Scorecard): string {
  const lines: string[] = [];
  const rule = "─".repeat(60);

  lines.push(rule);
  lines.push(`LegalCiteEval — ${sc.agentName}`);
  if (sc.model !== undefined) lines.push(`Model: ${sc.model}`);
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
