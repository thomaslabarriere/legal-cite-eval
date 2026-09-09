// ============================================================================
// LegalCiteEval — retrieval (the RAG dimension).
//
// A retriever narrows the full corpus to a small candidate set for a question.
// This is a deliberately SIMPLE lexical baseline (token overlap between the
// question and each article label, with a light domain-synonym boost) — NOT an
// embedding/reranking pipeline. The point is not the retriever's sophistication
// but MEASURING it: `missed_retrieval` records whether the key authority
// actually surfaced in the retrieved set (retrieval recall). Swap in a real
// retriever and the same metric grades it.
// ============================================================================

import type { LegalRef } from "../types.js";
import { corpus } from "./corpus.js";
import { normalizeRef } from "./normalize.js";

export interface Retriever {
  name: string;
  /** Return up to `k` candidate article refs for the question, best first. */
  retrieve(question: string, k: number): LegalRef[];
}

const STOPWORDS = new Set<string>([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "au", "aux",
  "et", "ou", "à", "a", "en", "par", "pour", "sur", "sa", "son", "ses", "se",
  "que", "qui", "quel", "quelle", "quels", "quelles", "dont", "ne", "pas",
  "peut", "elle", "il", "ils", "est", "être", "sont", "cette", "ce", "cet",
  "plus", "moins", "dans", "avec", "sans", "leur", "leurs", "on",
  "quoi", "prévoit", "fondement", "texte", "personne", "autrui", "tiers",
]);

/** Domain synonyms so question vocabulary maps onto label vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  dommage: ["responsabilité", "réparer", "préjudice"],
  reparer: ["responsabilité", "dommage"],
  garde: ["choses", "gardien"],
  gardien: ["choses", "garde"],
  chose: ["choses"],
  pourparlers: ["négociations", "précontractuelles", "négociation"],
  precontractuels: ["précontractuelles", "négociations"],
  dissimule: ["dol", "consentement"],
  consentement: ["dol", "vices"],
  circonstances: ["imprévision", "changement"],
  imprevisible: ["imprévision", "imprévisible"],
  execution: ["exécution", "inexécution", "obligation"],
  executer: ["exécution", "obligation", "force", "obligatoire"],
  contrat: ["contrat", "contractuelle", "obligatoire"],
  vie: ["vie", "privée"],
  privee: ["vie", "privée"],
  magazine: ["vie", "privée"],
  debiteur: ["inexécution", "obligation", "dommages"],
  creancier: ["inexécution", "dommages"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents for matching
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function expand(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    for (const syn of SYNONYMS[t] ?? []) {
      for (const s of tokenize(syn)) out.add(s);
    }
  }
  return out;
}

/**
 * Lexical baseline retriever. Scores each corpus article by the number of
 * (accent-stripped) tokens its label shares with the (synonym-expanded)
 * question, and returns the top `k`. Ties break by ascending article number
 * for determinism.
 */
export function keywordRetriever(): Retriever {
  const labelTokens = new Map<LegalRef, Set<string>>();
  for (const entry of Object.values(corpus)) {
    labelTokens.set(entry.article, new Set(tokenize(entry.label)));
  }

  return {
    name: "retriever:keyword",
    retrieve(question: string, k: number): LegalRef[] {
      const qTokens = expand(tokenize(question));
      const scored: Array<{ ref: LegalRef; score: number }> = [];
      for (const [ref, tokens] of labelTokens) {
        let score = 0;
        for (const t of qTokens) if (tokens.has(t)) score += 1;
        scored.push({ ref, score });
      }
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.ref.localeCompare(b.ref, undefined, { numeric: true });
      });
      return scored
        .filter((s) => s.score > 0)
        .slice(0, k)
        .map((s) => s.ref);
    },
  };
}

/**
 * Test fixture (mutation proof): a broken retriever that always returns the
 * same off-topic articles, so the key authority is never surfaced →
 * `missed_retrieval` must fire.
 */
export const narrowRetriever: Retriever = {
  name: "retriever:narrow-broken",
  retrieve(_question: string, k: number): LegalRef[] {
    return ["544", "1101", "1102", "1113"].slice(0, k);
  },
};

/**
 * Test fixture (control): an oracle retriever that always surfaces the given
 * key authorities (plus filler), so `missed_retrieval` must NOT fire. Proves
 * the recall metric does not false-positive on a good retriever.
 */
export function oracleRetriever(
  keyByQuestion: Map<string, LegalRef[]>,
): Retriever {
  return {
    name: "retriever:oracle",
    retrieve(question: string, k: number): LegalRef[] {
      const keys = (keyByQuestion.get(question) ?? []).map(normalizeRef);
      const filler = ["1101", "1102", "544"];
      const out: LegalRef[] = [];
      for (const ref of [...keys, ...filler]) {
        if (!out.includes(ref)) out.push(ref);
      }
      return out.slice(0, Math.max(k, keys.length));
    },
  };
}
