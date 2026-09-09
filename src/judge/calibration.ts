import type { Judge, JudgeGoldItem, JudgeCalibration } from "../types.js";

/**
 * Measure a judge's reliability against a gold set (who judges the judge?).
 *
 * For each gold item the judge assesses the single citation; we compare its
 * `relevant` verdict to the ground-truth label:
 *  - agree:         judge verdict == gold label
 *  - falsePositive: judge relevant=true,  gold relevant=false
 *  - falseNegative: judge relevant=false, gold relevant=true
 *
 * If the judge returns no judgment for the citation we treat it as
 * relevant=true (fail-open), consistent with the judges in judge.ts. Given a
 * deterministic judge this function is deterministic.
 */
export async function calibrateJudge(
  judge: Judge,
  gold: JudgeGoldItem[],
): Promise<JudgeCalibration> {
  let agree = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (const item of gold) {
    const judgments = await judge.assess({
      question: item.question,
      answer: item.answer,
      citations: [item.citation],
    });

    // Fail-open if the judge returned no verdict for this citation.
    const first = judgments[0];
    const judgedRelevant = first !== undefined ? first.relevant : true;

    if (judgedRelevant === item.relevant) {
      agree++;
    } else if (judgedRelevant && !item.relevant) {
      falsePositive++;
    } else {
      falseNegative++;
    }
  }

  const total = gold.length;
  return {
    judgeName: judge.name,
    total,
    agree,
    falsePositive,
    falseNegative,
    agreementRate: total > 0 ? agree / total : 1,
  };
}
