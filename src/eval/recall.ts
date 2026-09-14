// ============================================================================
// LegalCiteEval — retrieval recall comparison.
//
// Recall@k = fraction of labelled questions whose key authorities ALL appear in
// the top-k retrieved set (the same condition `missed_retrieval` grades in the
// pipeline, so the comparison and the diagnostic agree). Deterministic and
// offline via the hashing embedder; pass a real EmbeddingClient for real
// numbers.
// ============================================================================

import type { LegalRef, Question } from "../types.js";
import { normalizeRef } from "../corpus/normalize.js";
import type { Retriever } from "../corpus/retrieve.js";

export interface RecallResult {
  name: string;
  recall: number;
  hits: number;
  total: number;
  /** Ids of questions whose key authority was NOT fully retrieved. */
  missed: string[];
}

/** True iff every key authority of the question is in the retrieved set. */
function retrievedAll(retrieved: LegalRef[], question: Question): boolean {
  const inSet = new Set<LegalRef>(retrieved.map(normalizeRef));
  return question.expected.keyAuthorities.every((a) => inSet.has(normalizeRef(a)));
}

export async function recallAtK(
  retriever: Retriever,
  questions: Question[],
  k: number,
): Promise<RecallResult> {
  if (questions.length === 0) {
    return { name: retriever.name, recall: 1, hits: 0, total: 0, missed: [] };
  }
  let hits = 0;
  const missed: string[] = [];
  for (const question of questions) {
    const retrieved = await retriever.retrieve(question.question, k);
    if (retrievedAll(retrieved, question)) hits++;
    else missed.push(question.id);
  }
  return {
    name: retriever.name,
    recall: hits / questions.length,
    hits,
    total: questions.length,
    missed,
  };
}
