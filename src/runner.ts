import type {
  Judge,
  LegalAgent,
  LegalRef,
  Question,
  QuestionResult,
  RunStats,
} from "./types.js";
import type { Retriever } from "./corpus/retrieve.js";
import { evaluateQuestion } from "./eval/evaluate.js";

/** RAG configuration for a run: which retriever and how many candidates. */
export interface RetrievalOptions {
  retriever: Retriever;
  k: number;
}

/** Synthetic result for a question whose agent run threw (API error, etc.). */
function errorResult(
  question: Question,
  err: unknown,
  retrieved: LegalRef[] | undefined,
): QuestionResult {
  const message = err instanceof Error ? err.message : String(err);
  const trace: QuestionResult["trace"] = {
    question: question.question,
    answer: `ERROR: ${message}`,
    citations: [],
    hallucinated: [],
    judgments: [],
  };
  if (retrieved !== undefined) trace.retrieved = retrieved;
  return {
    questionId: question.id,
    title: question.title,
    passed: false,
    failures: ["agent_error"],
    applicableMetrics: ["agent_error"],
    trace,
  };
}

/**
 * Run one question against an agent, judged by `judge`, and evaluate it.
 * A thrown agent run is captured as an `agent_error` result, never propagated —
 * one failing question (or model) must not sink the rest of the run.
 *
 * In RAG mode (`retrieval` given) the retriever narrows the corpus first, the
 * retrieved set is passed to the agent, and retrieval recall is graded.
 * Latency and token usage are captured into `stats` for cost/throughput.
 */
export async function runQuestion(
  agent: LegalAgent,
  judge: Judge,
  question: Question,
  retrieval?: RetrievalOptions,
): Promise<QuestionResult> {
  const retrieved = retrieval
    ? await retrieval.retriever.retrieve(question.question, retrieval.k)
    : undefined;
  const start = Date.now();
  try {
    const run = await agent.run(
      retrieved !== undefined
        ? { question: question.question, allowedArticles: retrieved }
        : { question: question.question },
    );
    const latencyMs = Date.now() - start;
    const result = await evaluateQuestion(question, run, judge, retrieved);
    const stats: RunStats = { latencyMs };
    if (run.usage !== undefined) stats.usage = run.usage;
    result.stats = stats;
    return result;
  } catch (err) {
    return errorResult(question, err, retrieved);
  }
}

export async function runQuestions(
  agent: LegalAgent,
  judge: Judge,
  questions: Question[],
  retrieval?: RetrievalOptions,
): Promise<QuestionResult[]> {
  const results: QuestionResult[] = [];
  for (const question of questions) {
    results.push(await runQuestion(agent, judge, question, retrieval));
  }
  return results;
}
