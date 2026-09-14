import { describe, it, expect } from "vitest";
import { normalizeRef, normalizeCitations } from "../src/corpus/normalize.js";

describe("normalizeRef", () => {
  it("strips the common article prefixes to a bare token", () => {
    expect(normalizeRef("art. 1240")).toBe("1240");
    expect(normalizeRef("article 1240 du Code civil")).toBe("1240");
    expect(normalizeRef("Article 1231-1")).toBe("1231-1");
    expect(normalizeRef("1240 C. civ.")).toBe("1240");
    expect(normalizeRef("C. civ. 9")).toBe("9");
  });

  it("does NOT mistake a year for the article number (the 1804 trap)", () => {
    // "Code civil de 1804, art. 1240" must resolve to the article (1240),
    // not the year (1804) — the number attached to the article marker wins.
    expect(normalizeRef("Code civil de 1804, art. 1240")).toBe("1240");
    expect(normalizeRef("article 1103 du Code civil de 1804")).toBe("1103");
  });

  it("collapses an alinéa to its article (corpus is article-level)", () => {
    expect(normalizeRef("1240 al. 2")).toBe("1240");
    expect(normalizeRef("art. 1240 alinéa 1")).toBe("1240");
  });

  it("preserves a hallucinated / garbage citation rather than dropping it", () => {
    expect(normalizeRef("art. 9999")).toBe("9999");
    expect(normalizeRef("le principe général")).toBe("le principe général");
  });

  it("de-duplicates equivalent spellings after normalization", () => {
    expect(normalizeCitations(["art. 1240", "1240 C. civ.", "article 1240"])).toEqual([
      "1240",
    ]);
    expect(normalizeCitations(["1240", "", "1231-1"])).toEqual(["1240", "1231-1"]);
  });
});
