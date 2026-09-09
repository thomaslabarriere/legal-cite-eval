import OpenAI from "openai";
import type { LegalAgent, LegalRun, LegalRef, TokenUsage } from "../types.js";
import { renderCorpusForPrompt, renderArticlesForPrompt } from "../corpus/corpus.js";
import { tools, parseAnswerCall } from "./tools.js";

export type Provider = "openai" | "openrouter";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Build the system prompt. In RAG mode (`allowedArticles` given) the agent
 * sees ONLY the retrieved subset — so retrieval quality directly bounds what
 * it can cite. Otherwise it sees the full corpus.
 */
function buildSystemPrompt(allowedArticles?: LegalRef[]): string {
  const ragMode = allowedArticles !== undefined;
  const corpusListing = ragMode
    ? renderArticlesForPrompt(allowedArticles)
    : renderCorpusForPrompt();
  return [
    "You are a careful French legal assistant answering questions about the Code civil.",
    "Rules:",
    "- Cite ONLY Code civil articles from the provided corpus below.",
    "- Cite the key authority for the question.",
    "- NEVER invent an article number.",
    "- If you assert a legal conclusion, cite the supporting article.",
    "- Keep the answer concise.",
    "- You must call the answer_question tool.",
    "",
    ragMode
      ? "Retrieved Code civil articles (you may cite ONLY these):"
      : "Corpus (available Code civil articles):",
    corpusListing,
  ].join("\n");
}

function extractUsage(
  usage: OpenAI.Completions.CompletionUsage | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  };
}

export function createLLMAgent(opts: {
  model: string;
  provider?: Provider;
  apiKey?: string;
  baseURL?: string;
}): LegalAgent {
  const { model } = opts;
  const provider: Provider = opts.provider ?? "openai";

  const baseURL =
    opts.baseURL ??
    (provider === "openrouter" ? OPENROUTER_BASE_URL : undefined);

  const apiKey =
    opts.apiKey ??
    (provider === "openrouter"
      ? process.env["OPENROUTER_API_KEY"]
      : process.env["OPENAI_API_KEY"]);

  const client = new OpenAI({ apiKey, baseURL });

  async function run({
    question,
    allowedArticles,
  }: {
    question: string;
    allowedArticles?: LegalRef[];
  }): Promise<LegalRun> {
    const completion = await client.chat.completions.create({
      model,
      tools,
      tool_choice: "required",
      messages: [
        { role: "system", content: buildSystemPrompt(allowedArticles) },
        { role: "user", content: question },
      ],
    });

    const usage = extractUsage(completion.usage);
    const choice = completion.choices[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls ?? [];

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const parsed = parseAnswerCall(call.function.name, call.function.arguments);
      if (parsed !== null) {
        return usage !== undefined ? { ...parsed, usage } : parsed;
      }
    }

    const fallback: LegalRun = { answer: message?.content ?? "", citations: [] };
    return usage !== undefined ? { ...fallback, usage } : fallback;
  }

  return { name: `llm:${model}`, run };
}
