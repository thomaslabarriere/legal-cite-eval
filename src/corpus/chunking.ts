// ============================================================================
// LegalCiteEval — chunking dimension: retrieval granularity on a long article.
//
// A SEPARATE ANALYSIS, not a stage of the `run` diagnostic. Whole-article
// retrieval feeds an entire multi-paragraph article as context even when one
// passage answers the question — diluting the answer and inflating cost.
// Chunking retrieves the relevant PASSAGE instead. This module chunks a long
// sample article and measures, for a passage-specific question, whether
// chunking pinpoints the right passage and how much context it saves. Offline
// and deterministic. (Mirrors the sibling kb-reliability project, which also
// kept chunking as an analysis rather than overselling it as a wired stage.)
// ============================================================================

import { tokenize } from "./text.js";

// A long, multi-paragraph SYNTHETIC article (illustrative, not the verbatim
// Code civil), of the kind a long-form commentary entry would be. Whole-article
// retrieval would return all of this for any sub-question.
export const LONG_ARTICLE =
  "Résolution du contrat pour inexécution. La résolution met fin au contrat " +
  "lorsqu'une partie n'exécute pas son obligation de manière suffisamment " +
  "grave. Elle peut résulter de l'application d'une clause résolutoire. " +
  "Mise en demeure préalable. Sauf urgence, le créancier doit d'abord mettre " +
  "en demeure le débiteur défaillant de s'exécuter dans un délai raisonnable, " +
  "et cette mise en demeure doit mentionner expressément le risque de " +
  "résolution encouru. À défaut de mise en demeure régulière, la résolution " +
  "est irrégulière. Effets de la résolution. Une fois acquise, la résolution " +
  "libère les parties de leurs obligations et donne lieu à restitutions " +
  "réciproques des prestations déjà fournies. Contrôle du juge. La partie " +
  "qui conteste la résolution peut saisir le juge, qui apprécie la gravité de " +
  "l'inexécution et peut ordonner l'exécution forcée ou allouer des dommages.";

// A signature word of the "mise en demeure" passage (distinct from the other
// passages), used to check the right passage was pinpointed.
const TARGET_PASSAGE_MARKER = "demeure";

export interface Chunk {
  index: number;
  text: string;
}

/** Greedy sentence packing into chunks of at most `maxChars` characters. */
export function chunkText(text: string, maxChars: number): Chunk[] {
  const sentences = text
    .split(". ")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const chunks: Chunk[] = [];
  let current = "";
  for (const sentence of sentences) {
    const piece = sentence.endsWith(".") ? sentence : `${sentence}.`;
    if (current !== "" && current.length + 1 + piece.length > maxChars) {
      chunks.push({ index: chunks.length, text: current.trim() });
      current = piece;
    } else {
      current = current === "" ? piece : `${current} ${piece}`;
    }
  }
  if (current !== "") chunks.push({ index: chunks.length, text: current.trim() });
  return chunks;
}

function scoreOverlap(query: string, text: string): number {
  const q = new Set(tokenize(query));
  const doc = tokenize(text);
  let score = 0;
  for (const term of doc) if (q.has(term)) score += 1;
  return score;
}

export interface ChunkAnalysis {
  question: string;
  wholeContextChars: number;
  chunkContextChars: number;
  bestChunkText: string;
  targetPassageHit: boolean;
  /** 1 - chunk/whole: fraction of context characters saved by chunking. */
  contextReduction: number;
}

/** Compare whole-article vs chunk retrieval for a passage-specific question. */
export function analyzeChunking(question: string, maxChars = 160): ChunkAnalysis {
  const chunks = chunkText(LONG_ARTICLE, maxChars);
  let best: Chunk = chunks[0] ?? { index: 0, text: LONG_ARTICLE };
  let bestScore = -1;
  for (const chunk of chunks) {
    const score = scoreOverlap(question, chunk.text);
    // Higher score wins; ties keep the earlier chunk (deterministic).
    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  }
  const wholeContextChars = LONG_ARTICLE.length;
  const chunkContextChars = best.text.length;
  return {
    question,
    wholeContextChars,
    chunkContextChars,
    bestChunkText: best.text,
    targetPassageHit: best.text.toLowerCase().includes(TARGET_PASSAGE_MARKER),
    contextReduction:
      wholeContextChars === 0 ? 0 : 1 - chunkContextChars / wholeContextChars,
  };
}
