import OpenAI from "openai";
import type { LegalAgent, LegalRun } from "../types.js";
import { renderCorpusForPrompt } from "../corpus/corpus.js";
import { tools, parseAnswerCall } from "./tools.js";

export type Provider = "openai" | "openrouter";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function buildSystemPrompt(): string {
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
    "Corpus (available Code civil articles):",
    renderCorpusForPrompt(),
  ].join("\n");
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

  const systemPrompt = buildSystemPrompt();

  async function run({ question }: { question: string }): Promise<LegalRun> {
    const completion = await client.chat.completions.create({
      model,
      tools,
      tool_choice: "required",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });

    const choice = completion.choices[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls ?? [];

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const run = parseAnswerCall(call.function.name, call.function.arguments);
      if (run !== null) return run;
    }

    return { answer: message?.content ?? "", citations: [] };
  }

  return { name: `llm:${model}`, run };
}
