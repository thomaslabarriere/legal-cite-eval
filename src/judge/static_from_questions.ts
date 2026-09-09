import type { Judge, LegalRef } from "../types.js";
import { normalizeRef } from "../corpus/normalize.js";
import { questions } from "../scenarios/questions.js";
import { staticJudge } from "./judge.js";

/**
 * A deterministic judge that treats a citation as relevant iff it is one of the
 * question's expected key authorities. Used for the no-API-key CLI demo and for
 * tests, so citation relevance can be exercised without an LLM call.
 */
export function questionKeyedStaticJudge(): Judge {
  const map = new Map<string, Set<LegalRef>>(
    questions.map((q) => [
      q.question,
      new Set(q.expected.keyAuthorities.map(normalizeRef)),
    ]),
  );
  return staticJudge("judge:static-keyauthorities", map);
}
