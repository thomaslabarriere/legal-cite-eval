import type { QuestionResult } from "../types.js";

/**
 * Optional Langfuse tracing for LLM observability. Fully opt-in: no-op unless
 * LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are set. The `langfuse` package is
 * imported lazily and everything is wrapped so tracing can NEVER break a run.
 */
export async function sendTraces(
  agentName: string,
  model: string | undefined,
  results: QuestionResult[],
): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return;

  try {
    const mod = (await import("langfuse")) as unknown as {
      Langfuse: new (opts: {
        publicKey: string;
        secretKey: string;
        baseUrl?: string;
      }) => LangfuseLike;
    };
    const client = new mod.Langfuse({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_BASEURL,
    });

    for (const r of results) {
      const trace = client.trace({
        name: `legal-cite-eval:${r.questionId}`,
        input: r.trace.question,
        output: { answer: r.trace.answer, citations: r.trace.citations },
        metadata: {
          agent: agentName,
          model: model ?? null,
          title: r.title,
          hallucinated: r.trace.hallucinated,
          judgments: r.trace.judgments,
          failures: r.failures,
        },
        tags: ["legal-cite-eval", ...r.failures],
      });
      trace.score({ name: "passed", value: r.passed ? 1 : 0 });
    }

    await client.flushAsync();
    console.log(`[langfuse] sent ${results.length} traces`);
  } catch (err) {
    console.warn(
      `[langfuse] tracing skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

interface LangfuseLike {
  trace(opts: {
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): { score(opts: { name: string; value: number }): void };
  flushAsync(): Promise<unknown>;
}
