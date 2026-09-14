// ============================================================================
// Shared text tokenization, used by both the retrieval and embedding layers.
//
// Kept in one place (mirroring the sibling kb-reliability project) so the two
// layers depend on it explicitly rather than reaching into each other's
// internals — the lexical retriever, the hashing embedder and the reranker all
// tokenize the same way, which is what makes the offline comparison meaningful.
// ============================================================================

const STOPWORDS = new Set<string>([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "au", "aux",
  "et", "ou", "à", "a", "en", "par", "pour", "sur", "sa", "son", "ses", "se",
  "que", "qui", "quel", "quelle", "quels", "quelles", "dont", "ne", "pas",
  "peut", "elle", "il", "ils", "est", "être", "sont", "cette", "ce", "cet",
  "plus", "moins", "dans", "avec", "sans", "leur", "leurs", "on",
  "quoi", "prévoit", "fondement", "texte", "personne", "autrui", "tiers",
]);

/**
 * Lowercase, accent-stripped content tokens (stopwords + single chars dropped).
 * Accents are stripped so "exécution" and "execution" match; hyphens are kept
 * so compound article tokens like "1231-1" survive when they appear in text.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents for matching
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
