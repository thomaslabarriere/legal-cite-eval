import type { LegalRef } from "../types.js";

/**
 * Normalize a citation as written by an agent to a bare article token.
 * Handles "art. 1240", "article 1240 du Code civil", "1231-1", "C. civ. 9",
 * "1240 C. civ." → "1240" / "1231-1" / "9". Falls back to a cleaned lowercased
 * string if no article-number pattern is found (so a hallucinated "art. 9999"
 * still yields "9999" and a garbage citation is preserved rather than dropped).
 *
 * Disambiguation matters because most Code civil article numbers are themselves
 * 4 digits (1240, 1103, 2224...), so a bare "skip 4-digit years" heuristic
 * would wrongly drop real articles. Instead we prefer the number ATTACHED to an
 * article/code marker, so "Code civil de 1804, art. 1240" resolves to 1240, not
 * the year 1804. Alinéas ("1240 al. 2") collapse to the article ("1240"): the
 * corpus is article-level, so this is intentional for existence checking.
 */
export function normalizeRef(raw: string): LegalRef {
  // 1) number following an article marker: "art. 1240", "article 1240 ..."
  const afterMarker = raw.match(/art(?:icle)?\.?\s*(\d+(?:-\d+)?)/i);
  if (afterMarker && afterMarker[1] !== undefined) return afterMarker[1];
  // 2) number preceding a code marker: "1240 C. civ.", "1231-1 du Code civil"
  const beforeMarker = raw.match(/(\d+(?:-\d+)?)\s*(?:c\.?\s*civ|du\s+code\s+civil)/i);
  if (beforeMarker && beforeMarker[1] !== undefined) return beforeMarker[1];
  // 3) fallback: first article-number token (covers "C. civ. 9", bare "9999").
  const first = raw.match(/(\d+(?:-\d+)?)/);
  if (first && first[1] !== undefined) return first[1];
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
