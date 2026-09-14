// ============================================================================
// LegalCiteEval — reranking stage: reorder the retrieved shortlist by a sharper
// signal BEFORE the agent cites.
//
// First-stage retrieval optimizes recall (get the key article into the top-k)
// but not precision@1 — a wordy distractor can sit at rank 1. Because the agent
// is instructed to cite the key authority from the shortlist it is shown, the
// ORDER of that shortlist steers which article it cites. A reranker reorders the
// shortlist so the on-point article leads, and the change is observable in the
// diagnostic: the citation flips, and the relevance/authority attribution flips
// with it (see test/rerank.test.ts) — this is a wired-in stage, not an isolated
// `rerank()` that grades nothing.
//
// Two rerankers behind one interface:
//  - `lexicalReranker` — re-score by question/LABEL token overlap (a precision
//    signal the recall-oriented first stage lacks). Offline, deterministic.
//  - `llmReranker`     — ask a model to pick the most relevant candidate (needs
//    a key; injectable client seam, so the path is tested at 0 credits).
//    Fail-open: on any error the first-stage order is kept.
// ============================================================================

import type OpenAI from "openai";
import type { LegalRef } from "../types.js";
import { corpus } from "./corpus.js";
import { normalizeRef } from "./normalize.js";
import { tokenize } from "./text.js";

export interface Reranker {
  name: string;
  /** Reorder the retrieved shortlist for the question (best first). */
  rerank(question: string, candidates: LegalRef[]): Promise<LegalRef[]>;
}

function labelOf(ref: LegalRef): string {
  return corpus[normalizeRef(ref)]?.label ?? "";
}

/**
 * Reorder by question/label token overlap — a precision signal the first-stage
 * label-token retriever partly shares but the semantic path does not. Stable on
 * ties (keeps the incoming first-stage order), so it never reshuffles gratuitously.
 */
export function lexicalReranker(): Reranker {
  return {
    name: "reranker:lexical-label",
    async rerank(question: string, candidates: LegalRef[]): Promise<LegalRef[]> {
      const q = new Set(tokenize(question));
      const scored = candidates.map((ref, i) => {
        const overlap = tokenize(labelOf(ref)).filter((t) => q.has(t)).length;
        return { ref, overlap, i };
      });
      scored.sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        return a.i - b.i; // stable: preserve first-stage order on ties
      });
      return scored.map((s) => s.ref);
    },
  };
}

/** Minimal seam over the OpenAI client: only the chat surface is used. */
export type ChatClient = Pick<OpenAI, "chat">;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Parse the model's reply into a chosen index. Accepts a bare integer or the
 * first integer in the text. Returns null if none is found. Exported so the
 * pure parsing is unit-testable with zero API calls.
 */
export function parseChoiceIndex(content: string, count: number): number | null {
  const match = content.match(/\d+/);
  if (match === null) return null;
  const idx = Number(match[0]);
  if (!Number.isInteger(idx) || idx < 0 || idx >= count) return null;
  return idx;
}

/**
 * Ask a model to pick the single most relevant candidate and move it to rank 1
 * (needs a key). Fail-OPEN: on any error, malformed reply, or out-of-range
 * index, the first-stage order is kept unchanged — a reranker outage must never
 * corrupt the shortlist. Cost/latency are added on top of retrieval; that is
 * the trade this stage makes (see DECISIONS).
 */
export function llmReranker(opts: {
  model: string;
  apiKey?: string;
  baseURL?: string;
  provider?: "openai" | "openrouter";
  /** Injectable client seam for tests (defaults to a real OpenAI client). */
  client?: ChatClient;
}): Reranker {
  const { model } = opts;
  const provider = opts.provider ?? "openai";
  const baseURL = opts.baseURL ?? (provider === "openrouter" ? OPENROUTER_BASE_URL : undefined);
  const apiKey =
    opts.apiKey ??
    (provider === "openrouter" ? process.env["OPENROUTER_API_KEY"] : process.env["OPENAI_API_KEY"]);

  let client = opts.client;
  async function getClient(): Promise<ChatClient> {
    if (client === undefined) {
      const { default: OpenAIClient } = await import("openai");
      client = new OpenAIClient({ apiKey, baseURL });
    }
    return client;
  }

  return {
    name: `reranker:llm:${model}`,
    async rerank(question: string, candidates: LegalRef[]): Promise<LegalRef[]> {
      if (candidates.length <= 1) return candidates;
      const listing = candidates
        .map((ref, i) => `[${i}] ${ref}: ${labelOf(ref)}`)
        .join("\n");
      const prompt = [
        `Question: ${question}`,
        "",
        "Candidats (articles du Code civil):",
        listing,
        "",
        "Réponds UNIQUEMENT par l'index du candidat le plus pertinent pour répondre à la question.",
      ].join("\n");
      try {
        const c = await getClient();
        const completion = await c.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
        });
        const content = completion.choices[0]?.message?.content ?? "";
        const idx = parseChoiceIndex(content, candidates.length);
        if (idx === null) return candidates;
        const chosen = candidates[idx];
        if (chosen === undefined) return candidates;
        return [chosen, ...candidates.filter((_, i) => i !== idx)];
      } catch {
        return candidates; // fail-open: keep first-stage order
      }
    },
  };
}

export type RerankerKind = "lexical" | "llm";
