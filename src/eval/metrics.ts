// ============================================================================
// LegalCiteEval — metric predicates.
//
// Pure, mostly-objective predicates. Each answers a single yes/no question
// about a run. Only `failsIrrelevantCitation` is subjective: it reads the
// judge's relevance verdicts. All others are grounded in the corpus and the
// ground-truth expectation.
// ============================================================================

import type {
  CitationJudgment,
  ExpectedAnswer,
  LegalRef,
  LegalRun,
} from "../types.js";
import { existsInCorpus } from "../corpus/corpus.js";
import { normalizeCitations, normalizeRef } from "../corpus/normalize.js";

/**
 * TRUE if any (normalized) citation is not present in the corpus — i.e. the
 * agent invented an article that does not exist.
 */
export function failsHallucinatedCitation(citations: LegalRef[]): boolean {
  return citations.some((c) => !existsInCorpus(c));
}

/**
 * TRUE if any of `expected.keyAuthorities` (normalized) is absent from the
 * (normalized) citations — a required authority was missed.
 */
export function failsMissedAuthority(
  expected: ExpectedAnswer,
  citations: LegalRef[],
): boolean {
  const cited = new Set<LegalRef>(citations.map((c) => normalizeRef(c)));
  return expected.keyAuthorities.some((a) => !cited.has(normalizeRef(a)));
}

/**
 * TRUE if the question requires a citation, the agent produced an answer of
 * substance, yet cited nothing — an unsupported claim.
 */
export function failsUnsupportedClaim(
  expected: ExpectedAnswer,
  run: LegalRun,
): boolean {
  const requiresCitation = expected.requiresCitation ?? true;
  return (
    requiresCitation &&
    run.answer.trim().length > 0 &&
    normalizeCitations(run.citations).length === 0
  );
}

/**
 * TRUE if the judge marked any assessed citation as CONFIRMED not relevant.
 * An `uncertain` judgment (judge could not verify) does NOT fire this metric:
 * a judge outage must not fabricate an agent failure (see DECISIONS #6).
 */
export function failsIrrelevantCitation(
  judgments: CitationJudgment[],
): boolean {
  return judgments.some((j) => j.relevant === false && j.uncertain !== true);
}

/**
 * RAG mode. TRUE if any of `expected.keyAuthorities` (normalized) was NOT in
 * the retrieved set — the retriever failed to surface the key authority, so
 * the agent had no chance to cite it (retrieval recall < 100%).
 */
export function failsMissedRetrieval(
  expected: ExpectedAnswer,
  retrieved: LegalRef[],
): boolean {
  const inSet = new Set<LegalRef>(retrieved.map((r) => normalizeRef(r)));
  return expected.keyAuthorities.some((a) => !inSet.has(normalizeRef(a)));
}
