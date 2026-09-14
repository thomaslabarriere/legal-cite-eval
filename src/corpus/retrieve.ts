// ============================================================================
// LegalCiteEval — retrieval (the RAG dimension).
//
// A retriever narrows the full corpus to a small candidate set for a question.
// Three real strategies sit behind the `Retriever` interface (ported from the
// sibling kb-reliability project):
//  - `keywordRetriever`  — a lexical token-overlap baseline over the short
//    article LABEL, with a light domain-synonym boost. Freshness-naive by
//    design; it only sees the label, so a paraphrased question whose vocabulary
//    misses the label is missed.
//  - `semanticRetriever` — embeddings + cosine over the fuller article TEXT
//    (label + gloss). Reaches an article whose gloss shares the question's
//    vocabulary even when its label does not.
//  - `hybridRetriever`   — reciprocal-rank fusion (RRF) of the lexical and
//    semantic rankings (the standard hybrid technique; no score normalization).
//
// The point is not the retriever's sophistication but MEASURING it:
// `missed_retrieval` records whether the key authority actually surfaced in the
// retrieved set (retrieval recall), and every strategy passes through the SAME
// diagnostic — so this is retriever-agnostic, not a demo.
// ============================================================================

import type { CorpusEntry, LegalRef } from "../types.js";
import { articleText, corpus } from "./corpus.js";
import { cosine, type Embedder } from "./embeddings.js";
import { normalizeRef } from "./normalize.js";
import { tokenize } from "./text.js";

export interface Retriever {
  name: string;
  /** Return up to `k` candidate article refs for the question, best first. */
  retrieve(question: string, k: number): Promise<LegalRef[]>;
}

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

/** Corpus articles in a stable order (ascending article number). */
function corpusEntries(): CorpusEntry[] {
  return Object.values(corpus).sort((a, b) =>
    a.article.localeCompare(b.article, undefined, { numeric: true }),
  );
}

/**
 * Reciprocal-rank fusion: fuse several ranked id-lists into one.
 * RRF score = sum over lists of 1/(k + rank). Being rank-based, it needs no
 * score normalization between lexical and semantic — the standard way to
 * combine heterogeneous retrievers. Ties break by ascending id for determinism.
 */
export function reciprocalRankFusion(rankings: LegalRef[][], k = 60): LegalRef[] {
  const scores = new Map<LegalRef, number>();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank];
      if (id === undefined) continue;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.keys()].sort((a, b) => {
    const sa = scores.get(a) ?? 0;
    const sb = scores.get(b) ?? 0;
    if (sb !== sa) return sb - sa;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

/**
 * Lexical baseline retriever. Scores each corpus article by the number of
 * (accent-stripped) tokens its LABEL shares with the (synonym-expanded)
 * question, and returns the top `k`. Ties break by ascending article number
 * for determinism. Only articles with a positive score are returned.
 */
export function keywordRetriever(): Retriever {
  const labelTokens = new Map<LegalRef, Set<string>>();
  for (const entry of corpusEntries()) {
    labelTokens.set(entry.article, new Set(tokenize(entry.label)));
  }

  return {
    name: "retriever:keyword",
    async retrieve(question: string, k: number): Promise<LegalRef[]> {
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
 * Semantic retriever: embeddings + cosine over the fuller article TEXT
 * (label + gloss). Article vectors are embedded once and cached; each query
 * embeds the question and ranks all articles by cosine. Unlike the lexical
 * baseline it does not filter on token overlap, so it always returns `k`
 * articles (best cosine first, ties by article number).
 */
export function semanticRetriever(embedder: Embedder): Retriever {
  const entries = corpusEntries();
  let vectors: Map<LegalRef, number[]> | undefined;

  async function articleVectors(): Promise<Map<LegalRef, number[]>> {
    if (vectors === undefined) {
      const embedded = await embedder.embed(entries.map(articleText));
      const map = new Map<LegalRef, number[]>();
      entries.forEach((entry, i) => map.set(entry.article, embedded[i] ?? []));
      vectors = map;
    }
    return vectors;
  }

  return {
    name: `retriever:semantic(${embedder.name})`,
    async retrieve(question: string, k: number): Promise<LegalRef[]> {
      const vecs = await articleVectors();
      const [qVec] = await embedder.embed([question]);
      const query = qVec ?? [];
      const scored = entries.map((entry) => ({
        ref: entry.article,
        score: cosine(query, vecs.get(entry.article) ?? []),
      }));
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.ref.localeCompare(b.ref, undefined, { numeric: true });
      });
      return scored.slice(0, k).map((s) => s.ref);
    },
  };
}

/**
 * Hybrid retriever: reciprocal-rank fusion of a lexical and a semantic
 * retriever. Each sub-retriever is asked for the full corpus depth so RRF sees
 * complete rankings, then the fused top `k` is returned.
 */
export function hybridRetriever(
  lexical: Retriever,
  semantic: Retriever,
  kRrf = 60,
): Retriever {
  const depth = Object.keys(corpus).length;
  return {
    name: "retriever:hybrid",
    async retrieve(question: string, k: number): Promise<LegalRef[]> {
      const [lex, sem] = await Promise.all([
        lexical.retrieve(question, depth),
        semantic.retrieve(question, depth),
      ]);
      return reciprocalRankFusion([lex, sem], kRrf).slice(0, k);
    },
  };
}

export type RetrieverKind = "keyword" | "semantic" | "hybrid";

/**
 * Build a named retriever. `semantic`/`hybrid` need an embedder (offline
 * hashing by default via `defaultEmbedder`, or the real OpenAI client when a
 * key is set). All three pass through the same diagnostic.
 */
export function buildRetriever(kind: RetrieverKind, embedder: Embedder): Retriever {
  switch (kind) {
    case "keyword":
      return keywordRetriever();
    case "semantic":
      return semanticRetriever(embedder);
    case "hybrid":
      return hybridRetriever(keywordRetriever(), semanticRetriever(embedder));
  }
}

/**
 * Test fixture (mutation proof): a broken retriever that always returns the
 * same off-topic articles, so the key authority is never surfaced →
 * `missed_retrieval` must fire.
 */
export const narrowRetriever: Retriever = {
  name: "retriever:narrow-broken",
  async retrieve(_question: string, k: number): Promise<LegalRef[]> {
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
    async retrieve(question: string, k: number): Promise<LegalRef[]> {
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
