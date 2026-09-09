import type { Judge, LegalAgent, Question, QuestionResult } from "./types.js";
import { evaluateQuestion } from "./eval/evaluate.js";

/** Synthetic result for a question whose agent run threw (API error, etc.). */
function errorResult(question: Question, err: unknown): QuestionResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    questionId: question.id,
    title: question.title,
    passed: false,
    failures: ["agent_error"],
    applicableMetrics: ["agent_error"],
    trace: {
      question: question.question,
      answer: `ERROR: ${message}`,
      citations: [],
      hallucinated: [],
      judgments: [],
    },
  };
}

/**
 * Run one question against an agent, judged by `judge`, and evaluate it.
 * A thrown agent run is captured as an `agent_error` result, never propagated —
 * one failing question (or model) must not sink the rest of the run.
 */
export async function runQuestion(
  agent: LegalAgent,
  judge: Judge,
  question: Question,
): Promise<QuestionResult> {
  try {
    const run = await agent.run({ question: question.question });
    return await evaluateQuestion(question, run, judge);
  } catch (err) {
    return errorResult(question, err);
  }
}

export async function runQuestions(
  agent: LegalAgent,
  judge: Judge,
  questions: Question[],
): Promise<QuestionResult[]> {
  const results: QuestionResult[] = [];
  for (const question of questions) {
    results.push(await runQuestion(agent, judge, question));
  }
  return results;
}
