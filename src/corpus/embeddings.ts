// ============================================================================
// LegalCiteEval — embedding client + cosine, used by the semantic/hybrid
// retrievers (the RAG-depth dimension ported from the sibling kb-reliability
// project).
//
// Two embedders sit behind one `Embedder` interface:
//  - `EmbeddingClient` — the real OpenAI embeddings endpoint (needs a key).
//  - `HashingEmbedder` — a deterministic OFFLINE fallback (hashed bag-of-words)
//    so semantic/hybrid retrieval and the recall comparison run with NO key and
//    NO network. It is a crude lexical-semantic signal, not a substitute for a
//    real embedding model — the `EmbeddingClient` path is used whenever a key
//    is set (`defaultEmbedder`).
//
// The OpenAI call is isolated here so the retrieval logic (ranking, fusion)
// stays pure and unit-testable without a network. A client seam is injectable
// for tests, so the real code path is exercised at 0 credits.
// ============================================================================

import { createHash } from "node:crypto";
import type OpenAI from "openai";
import { tokenize } from "./text.js";

/** An embedder maps texts to dense vectors of equal length. */
export interface Embedder {
  name: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Cosine similarity of two equal-length vectors (0 if either is a zero vector). */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Deterministic OFFLINE embedder: hashed bag-of-words vectors, no key.
 *
 * Each content token is hashed into one of `dim` buckets and counted, so two
 * texts sharing tokens get overlapping vectors and cosine gives a real (if
 * crude) signal. Because it is bag-of-words, "semantic" here largely replays
 * lexical overlap — the discriminating power over the lexical baseline comes
 * from what the two index (the embedder reads the fuller article gloss; see
 * `semanticRetriever`), not from any learned meaning. Not a real embedding
 * model; the `EmbeddingClient` path replaces it whenever a key is present.
 */
export class HashingEmbedder implements Embedder {
  public readonly name: string;
  private readonly dim: number;

  constructor(dim = 256) {
    this.dim = dim;
    this.name = `embedder:hashing-${dim}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vector(t));
  }

  private vector(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0);
    for (const token of tokenize(text)) {
      const digest = createHash("sha1").update(token, "utf8").digest("hex");
      // Use the low 52 bits of the digest, well within Number's safe integer
      // range, then modulo into a bucket — deterministic across platforms.
      const bucket = Number(BigInt("0x" + digest) % BigInt(this.dim));
      const current = vec[bucket] ?? 0;
      vec[bucket] = current + 1;
    }
    return vec;
  }
}

/** Minimal seam over the OpenAI client: only the embeddings surface is used. */
export type EmbeddingsClientSeam = Pick<OpenAI, "embeddings">;

/**
 * Thin wrapper over an OpenAI-compatible embeddings endpoint. Needs a key only
 * when actually called; the client is created lazily on first `embed`.
 */
export class EmbeddingClient implements Embedder {
  public readonly name: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string | undefined;
  private client: EmbeddingsClientSeam | undefined;

  constructor(opts: {
    model?: string;
    apiKey?: string;
    baseURL?: string;
    /** Injectable client seam for tests (defaults to a real OpenAI client). */
    client?: EmbeddingsClientSeam;
  } = {}) {
    this.model = opts.model ?? "text-embedding-3-small";
    this.name = `embedder:${this.model}`;
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL;
    this.client = opts.client;
  }

  private async getClient(): Promise<EmbeddingsClientSeam> {
    if (this.client === undefined) {
      const { default: OpenAIClient } = await import("openai");
      this.client = new OpenAIClient({ apiKey: this.apiKey, baseURL: this.baseURL });
    }
    return this.client;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const client = await this.getClient();
    const response = await client.embeddings.create({ model: this.model, input: texts });
    return response.data.map((item) => item.embedding);
  }
}

/**
 * Pick the embedder for the current environment: the real OpenAI client when a
 * key is present, else the deterministic offline hashing embedder. This keeps
 * the retrievers and the `retrievers` command runnable with zero setup.
 */
export function defaultEmbedder(): Embedder {
  if (process.env["OPENAI_API_KEY"]) {
    return new EmbeddingClient({ apiKey: process.env["OPENAI_API_KEY"] });
  }
  return new HashingEmbedder();
}
