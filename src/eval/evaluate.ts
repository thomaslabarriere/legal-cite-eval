// ============================================================================
// LegalCiteEval — evaluate a single question against an agent run.
//
// Applies the metric predicates, records which metrics are applicable (rate
// denominators) and which failed, and asks the judge to assess relevance for
// the citations that actually exist in the corpus.
// ============================================================================

import type {
  CitationJudgment,
  Judge,
  LegalRef,
  LegalRun,
  MetricKey,
  Question,
  QuestionResult,
} from "../types.js";
import { existsInCorpus } from "../corpus/corpus.js";
import { normalizeCitations } from "../corpus/normalize.js";
import {
  failsHallucinatedCitation,
  failsIrrelevantCitation,
  failsMissedAuthority,
  failsUnsupportedClaim,
} from "./metrics.js";

export async function evaluateQuestion(
  question: Question,
  run: LegalRun,
  judge: Judge,
): Promise<QuestionResult> {
  const citations: LegalRef[] = normalizeCitations(run.citations);
  const hallucinated: LegalRef[] = citations.filter((c) => !existsInCorpus(c));

  // Judge only the citations that EXIST in the corpus — hallucinated ones are
  // already owned by the hallucinated_citation metric.
  const known: LegalRef[] = citations.filter(existsInCorpus);
  const judgments: CitationJudgment[] =
    known.length > 0
      ? await judge.assess({
          question: question.question,
          answer: run.answer,
          citations: known,
        })
      : [];

  const applicableMetrics: MetricKey[] = [];
  const failures: MetricKey[] = [];

  const check = (metric: MetricKey, applicable: boolean, failed: boolean): void => {
    if (!applicable) return;
    applicableMetrics.push(metric);
    if (failed) failures.push(metric);
  };

  check(
    "hallucinated_citation",
    true,
    failsHallucinatedCitation(citations),
  );
  check(
    "missed_authority",
    question.expected.keyAuthorities.length > 0,
    failsMissedAuthority(question.expected, citations),
  );
  check(
    "unsupported_claim",
    question.expected.requiresCitation ?? true,
    failsUnsupportedClaim(question.expected, run),
  );
  check(
    "irrelevant_citation",
    known.length > 0,
    failsIrrelevantCitation(judgments),
  );

  const passed = failures.length === 0;

  return {
    questionId: question.id,
    title: question.title,
    passed,
    failures,
    applicableMetrics,
    trace: {
      question: question.question,
      answer: run.answer,
      citations,
      hallucinated,
      judgments,
    },
  };
}
