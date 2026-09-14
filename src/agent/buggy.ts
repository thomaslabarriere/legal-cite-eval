import type { LegalAgent, LegalRun } from "../types.js";

/**
 * Deterministic, network-free agents that reliably trigger each failure
 * metric. Used to keep the evaluation instrument mutation-proof: if a metric
 * check regresses, the matching agent stops failing and a test breaks.
 */

/** Cites "9999", which is not in the corpus → hallucinated_citation. */
export const hallucinatorAgent: LegalAgent = {
  name: "buggy:hallucinator",
  async run({ question }): Promise<LegalRun> {
    return {
      answer: `Based on the applicable rules, the answer to "${question}" is as follows.`,
      citations: ["9999"],
    };
  },
};

/**
 * Always cites a REAL but off-topic corpus article (544, droit de propriété)
 * regardless of the question → irrelevant_citation.
 */
export const irrelevantCiterAgent: LegalAgent = {
  name: "buggy:irrelevant-citer",
  async run({ question }): Promise<LegalRun> {
    return {
      answer: `Here is a response to "${question}".`,
      citations: ["544"],
    };
  },
};

/** Asserts something with no supporting citation → unsupported_claim. */
export const unsupportedAgent: LegalAgent = {
  name: "buggy:unsupported",
  async run({ question }): Promise<LegalRun> {
    return {
      answer: `The law clearly resolves "${question}" in the claimant's favour.`,
      citations: [],
    };
  },
};

/**
 * Test fixture: an agent that cites whatever article leads the shortlist it is
 * shown (rank 1), abstaining if none was retrieved. It makes the effect of
 * reranking observable — reorder the shortlist and the citation (and its
 * attribution) follows. Not used by the CLI.
 */
export const topCitedAgent: LegalAgent = {
  name: "fixture:cite-top-retrieved",
  async run({ question, allowedArticles }): Promise<LegalRun> {
    const top = allowedArticles?.[0];
    if (top === undefined) {
      return { answer: `No article retrieved for "${question}".`, citations: [] };
    }
    return { answer: `The applicable article is ${top}.`, citations: [top] };
  },
};

/** Test fixture: `scriptedAgent` below is consumed by the mutation-proof tests
 *  (to build a "correct" control agent), not by the CLI. */
export interface ScriptedAnswer {
  match: string;
  run: LegalRun;
}

/**
 * Returns the run of the first answer whose `match` is a substring of the
 * question; otherwise a safe abstention. Tests build a "perfect" agent from
 * the questions' keyAuthorities.
 */
export function scriptedAgent(name: string, answers: ScriptedAnswer[]): LegalAgent {
  return {
    name,
    async run({ question }): Promise<LegalRun> {
      for (const answer of answers) {
        if (question.includes(answer.match)) return answer.run;
      }
      return { answer: "Insufficient basis to answer.", citations: [] };
    },
  };
}
