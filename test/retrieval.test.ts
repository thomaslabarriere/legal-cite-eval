import { describe, it, expect } from "vitest";
import type { LegalRef } from "../src/types.js";
import { questions } from "../src/scenarios/questions.js";
import { buildRetriever } from "../src/corpus/retrieve.js";
import { HashingEmbedder } from "../src/corpus/embeddings.js";
import { normalizeRef } from "../src/corpus/normalize.js";
import { recallAtK } from "../src/eval/recall.js";

// Deterministic offline embedder so these numbers are reproducible with no key.
const embedder = new HashingEmbedder();
const K = 4;

const HARD_IDS = [
  "violence-economique",
  "force-majeure",
  "devoir-information",
  "execution-forcee",
] as const;

function questionById(id: string): { question: string; key: LegalRef } {
  const q = questions.find((x) => x.id === id);
  if (!q) throw new Error(`question ${id} not found`);
  return { question: q.question, key: normalizeRef(q.expected.keyAuthorities[0] ?? "") };
}

describe("Phase 4 — the recall is no longer saturated; the embedding path recovers paraphrases", () => {
  it("the lexical baseline MISSES the key authority on every hard paraphrased question", async () => {
    const keyword = buildRetriever("keyword", embedder);
    for (const id of HARD_IDS) {
      const { question, key } = questionById(id);
      const got = (await keyword.retrieve(question, K)).map(normalizeRef);
      expect(got, `keyword should miss ${key} on ${id}`).not.toContain(key);
    }
  });

  it("the semantic retriever RECOVERS the key authority on every hard question (its gloss shares the vocabulary the label lacks)", async () => {
    const semantic = buildRetriever("semantic", embedder);
    for (const id of HARD_IDS) {
      const { question, key } = questionById(id);
      const got = (await semantic.retrieve(question, K)).map(normalizeRef);
      expect(got, `semantic should recover ${key} on ${id}`).toContain(key);
    }
  });

  it("shows a measurable recall delta: semantic and hybrid both beat lexical", async () => {
    const keyword = await recallAtK(buildRetriever("keyword", embedder), questions, K);
    const semantic = await recallAtK(buildRetriever("semantic", embedder), questions, K);
    const hybrid = await recallAtK(buildRetriever("hybrid", embedder), questions, K);

    expect(keyword.recall).toBeLessThan(1); // saturation is broken
    expect(semantic.recall).toBeGreaterThan(keyword.recall);
    expect(hybrid.recall).toBeGreaterThan(keyword.recall);

    // Regression guard: the exact measured offline recalls (deterministic via
    // the hashed bag-of-words embedder). Not tuned targets — whatever the
    // honest corpus/questions produce. Real embeddings (a key) shift these.
    expect([keyword.hits, keyword.total]).toEqual([7, 12]);
    expect([semantic.hits, semantic.total]).toEqual([8, 12]);
    expect([hybrid.hits, hybrid.total]).toEqual([8, 12]);
  });
});
