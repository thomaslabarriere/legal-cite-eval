import type { LegalRef } from "../types.js";

/**
 * Normalize a citation as written by an agent to a bare article token.
 * Handles "art. 1240", "article 1240 du Code civil", "1231-1", "C. civ. 9" →
 * "1240" / "1231-1" / "9". Falls back to a cleaned lowercased string if no
 * article-number pattern is found (so a hallucinated "art. 9999" still yields
 * "9999" and a garbage citation is preserved rather than dropped).
 */
export function normalizeRef(raw: string): LegalRef {
  const match = raw.match(/(\d+(?:-\d+)?)/);
  if (match && match[1] !== undefined) return match[1];
  return raw.trim().toLowerCase();
}

/** Normalize + de-duplicate a list of citations, dropping empties. */
export function normalizeCitations(refs: string[]): LegalRef[] {
  const seen = new Set<LegalRef>();
  const out: LegalRef[] = [];
  for (const raw of refs) {
    const ref = normalizeRef(raw);
    if (ref.length > 0 && !seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}
