import type OpenAI from "openai";
import type { LegalRun } from "../types.js";

/**
 * The single function tool exposed to the agent. It must answer the legal
 * question and cite ONLY Code civil articles from the provided corpus.
 */
export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "answer_question",
      description:
        "Answer the legal question and cite ONLY Code civil articles from the provided corpus. Cite the key article(s) supporting the answer; do not invent article numbers.",
      parameters: {
        type: "object",
        properties: {
          answer: {
            type: "string",
            description: "The concise answer to the legal question.",
          },
          citations: {
            type: "array",
            items: { type: "string" },
            description:
              "Code civil article numbers cited in support of the answer (from the provided corpus only).",
          },
        },
        required: ["answer", "citations"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Parse a tool call into a LegalRun. Returns null if the call is not the
 * expected tool or its arguments are malformed.
 */
export function parseAnswerCall(name: string, argsJson: string): LegalRun | null {
  if (name !== "answer_question") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(argsJson);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const answer = obj["answer"];
  const citations = obj["citations"];

  if (typeof answer !== "string") return null;
  if (!Array.isArray(citations)) return null;
  if (!citations.every((c): c is string => typeof c === "string")) return null;

  return { answer, citations };
}
