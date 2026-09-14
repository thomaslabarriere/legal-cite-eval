import { describe, it, expect } from "vitest";
import { analyzeChunking, chunkText, LONG_ARTICLE } from "../src/corpus/chunking.js";

describe("chunking analysis (separate analysis, not a pipeline stage)", () => {
  it("packs sentences into chunks under the char budget", () => {
    const chunks = chunkText(LONG_ARTICLE, 160);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // A single sentence may exceed the budget, but multi-sentence packing
      // must not: no chunk should be wildly over budget.
      expect(c.text.length).toBeLessThanOrEqual(220);
    }
  });

  it("pinpoints the mise-en-demeure passage and measures real context reduction", () => {
    const a = analyzeChunking(
      "Faut-il une mise en demeure avant de résoudre le contrat ?",
      160,
    );
    expect(a.targetPassageHit).toBe(true);
    // The best chunk is a small fraction of the whole article.
    expect(a.chunkContextChars).toBeLessThan(a.wholeContextChars);
    // Regression guard: a substantial, measured reduction (not a token gesture).
    expect(a.contextReduction).toBeGreaterThan(0.5);
  });

  it("is deterministic", () => {
    const q = "Faut-il une mise en demeure avant de résoudre le contrat ?";
    expect(analyzeChunking(q)).toEqual(analyzeChunking(q));
  });
});
