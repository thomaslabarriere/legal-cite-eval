// ============================================================================
// LegalCiteEval — shared contracts. Every module imports from here.
// Do NOT redefine these types elsewhere.
//
// SCOPE: this is NOT legal advice and NOT an authority on French law. The
// corpus is a small PUBLIC subset of the Code civil, the questions are
// synthetic, and there is no client data. The value is the evaluation
// instrument — including measuring the reliability of the LLM-as-a-Judge
// itself — not the legal content. Plug in real eval sets for real numbers.
// ============================================================================

/** A legal citation: a Code civil article number, normalized to digits only (e.g. "1240"). */
export type LegalRef = string;

export interface CorpusEntry {
  /** Normalized article number, e.g. "1240". */
  article: LegalRef;
  /** Short public label of the article. */
  label: string;
}

/** Corpus keyed by normalized article number. */
export type Corpus = Record<LegalRef, CorpusEntry>;

/** Ground truth for a question. */
export interface ExpectedAnswer {
  /** Article(s) that a correct answer must cite (the key authority). */
  keyAuthorities: LegalRef[];
  /** Whether an answer of substance must cite at least one authority (default true). */
  requiresCitation?: boolean;
}

export interface Question {
  id: string;
  title: string;
  question: string;
  expected: ExpectedAnswer;
}

// ---------- Agent under test ----------
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LegalRun {
  /** The agent's answer text. */
  answer: string;
  /** The article numbers the agent cited (as returned; normalized downstream). */
  citations: LegalRef[];
  /** Token usage for this call, when the backend reports it (for cost). */
  usage?: TokenUsage;
}

export interface LegalAgent {
  name: string;
  /**
   * Answer a question. In RAG mode the runner passes `allowedArticles` (the
   * retrieved subset) and the agent must cite only from those; otherwise the
   * agent sees the full corpus.
   */
  run(input: { question: string; allowedArticles?: LegalRef[] }): Promise<LegalRun>;
}

// ---------- LLM-as-a-Judge (relevance) ----------
export interface CitationJudgment {
  citation: LegalRef;
  /** Does this cited article actually support the answer to the question? */
  relevant: boolean;
  reason?: string;
}

/**
 * A judge assesses whether each cited article is relevant to (supports) the
 * answer. The real judge is an LLM; a deterministic judge is used in tests and
 * to demonstrate calibration. Its OWN reliability is measured (see calibration).
 */
export interface Judge {
  name: string;
  assess(input: {
    question: string;
    answer: string;
    citations: LegalRef[];
  }): Promise<CitationJudgment[]>;
}

// ---------- Judge calibration (the differentiator: who judges the judge?) ----------
/** One labelled example: is `citation` relevant to `answer` for `question`? */
export interface JudgeGoldItem {
  question: string;
  answer: string;
  citation: LegalRef;
  /** Ground-truth label. */
  relevant: boolean;
}

export interface JudgeCalibration {
  judgeName: string;
  total: number;
  agree: number;
  /** Judge said relevant, ground truth said not. */
  falsePositive: number;
  /** Judge said not relevant, ground truth said relevant. */
  falseNegative: number;
  /** agree / total (0..1). */
  agreementRate: number;
}

// ---------- Evaluation output ----------
export type MetricKey =
  | "hallucinated_citation"
  | "irrelevant_citation"
  | "unsupported_claim"
  | "missed_authority"
  | "missed_retrieval"
  | "agent_error";

export const METRIC_WEIGHT: Record<MetricKey, number> = {
  hallucinated_citation: 3,
  irrelevant_citation: 3,
  unsupported_claim: 2,
  missed_authority: 2,
  // Retrieval recall (RAG mode only): if the retriever never surfaced the key
  // authority, the agent could not cite it. Heavy — it caps the ceiling. When
  // it fires, `missed_authority` is made not-applicable (see evaluate.ts) so a
  // single retrieval failure is counted once, not twice.
  missed_retrieval: 3,
  agent_error: 2,
};

export interface QuestionResult {
  questionId: string;
  title: string;
  passed: boolean;
  failures: MetricKey[];
  /** Metrics applicable to this question (checked, pass or fail) — rate denominator. */
  applicableMetrics: MetricKey[];
  trace: {
    question: string;
    answer: string;
    citations: LegalRef[];
    hallucinated: LegalRef[];
    judgments: CitationJudgment[];
    /** RAG mode: the articles the retriever surfaced for this question. */
    retrieved?: LegalRef[];
  };
  /** Cost/latency signal for this question, when running a real model. */
  stats?: RunStats;
}

export interface RunStats {
  /** Wall-clock latency of the agent call, in milliseconds. */
  latencyMs: number;
  /** Token usage of the agent call, when the backend reports it. */
  usage?: TokenUsage;
}

/** Aggregate cost of a run, derived from per-question usage + a price table. */
export interface CostSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated USD, only when the model's price is known. */
  estimatedUsd?: number;
}

/** Aggregate latency/throughput of a run, from per-question wall-clock. */
export interface LatencySummary {
  totalMs: number;
  avgMs: number;
  /** Questions per second (throughput). */
  throughputPerSec: number;
}

export interface Scorecard {
  agentName: string;
  model?: string;
  totalQuestions: number;
  passed: number;
  /** 0..100, weighted (normalized by applicable weight). */
  reliabilityScore: number;
  rates: Partial<Record<MetricKey, number>>;
  perQuestion: QuestionResult[];
  /** Reliability of the judge that produced the relevance verdicts, if measured. */
  judgeCalibration?: JudgeCalibration;
  /** Whether this run used the RAG retrieval path. */
  ragMode?: boolean;
  /** Inference cost, when at least one question reported token usage. */
  cost?: CostSummary;
  /** Latency / throughput, when at least one question reported latency. */
  latency?: LatencySummary;
}
