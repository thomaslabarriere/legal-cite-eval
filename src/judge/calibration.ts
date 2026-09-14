import type { Judge, JudgeGoldItem, JudgeCalibration } from "../types.js";

/**
 * Measure a judge's reliability against a gold set (who judges the judge?).
 *
 * For each gold item the judge assesses the single citation; we compare its
 * `relevant` verdict to the ground-truth label:
 *  - agree:         judge verdict == gold label
 *  - falsePositive: judge relevant=true,  gold relevant=false
 *  - falseNegative: judge relevant=false, gold relevant=true
 *  - uncertain:     judge could not verify (or returned no verdict) -> EXCLUDED
 *                   from agree/FP/FN and from the rate denominator, so a judge
 *                   outage never fabricates a false positive nor moves the rate
 *                   (this is why the harness fails SAFE, not open).
 *
 * The agreement rate is over VERIFIED items only: agree / (total - uncertain).
 * Given a deterministic judge this function is deterministic.
 */
export async function calibrateJudge(
  judge: Judge,
  gold: JudgeGoldItem[],
): Promise<JudgeCalibration> {
  let agree = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let uncertain = 0;

  for (const item of gold) {
    const judgments = await judge.assess({
      question: item.question,
      answer: item.answer,
      citations: [item.citation],
    });

    const first = judgments[0];
    // No verdict at all, or an explicit uncertain verdict -> unverified.
    if (first === undefined || first.uncertain === true) {
      uncertain++;
      continue;
    }
    const judgedRelevant = first.relevant;

    if (judgedRelevant === item.relevant) {
      agree++;
    } else if (judgedRelevant && !item.relevant) {
      falsePositive++;
    } else {
      falseNegative++;
    }
  }

  const total = gold.length;
  const verified = total - uncertain;
  return {
    judgeName: judge.name,
    total,
    agree,
    falsePositive,
    falseNegative,
    uncertain,
    agreementRate: verified > 0 ? agree / verified : 1,
  };
}
