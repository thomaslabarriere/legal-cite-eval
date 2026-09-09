import OpenAI from "openai";
import type { Judge, CitationJudgment, LegalRef } from "../types.js";
import { renderCorpusForPrompt } from "../corpus/corpus.js";
import { normalizeRef } from "../corpus/normalize.js";
import type { Provider } from "../agent/runAgent.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * The single function tool the judge must call: for each cited article, say
 * whether it actually SUPPORTS the answer to the question.
 */
const judgeTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "report_relevance",
      description:
        "Report, for each cited Code civil article, whether it actually supports the answer to the question.",
      parameters: {
        type: "object",
        properties: {
          verdicts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                citation: {
                  type: "string",
                  description: "The cited article number, exactly as given in the input.",
                },
                relevant: {
                  type: "boolean",
                  description: "True iff this article supports the answer to the question.",
                },
                reason: {
                  type: "string",
                  description: "Brief justification for the verdict.",
                },
              },
              required: ["citation", "relevant"],
              additionalProperties: false,
            },
          },
        },
        required: ["verdicts"],
        additionalProperties: false,
      },
    },
  },
];

interface ParsedVerdict {
  citation: LegalRef;
  relevant: boolean;
  reason?: string;
}

/**
 * Parse the tool-call arguments into a map of normalized citation -> verdict.
 * Returns null if the payload is not the expected shape. Individual malformed
 * entries are skipped rather than failing the whole parse.
 */
function parseVerdicts(argsJson: string): Map<LegalRef, ParsedVerdict> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argsJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const verdicts = (parsed as Record<string, unknown>)["verdicts"];
  if (!Array.isArray(verdicts)) return null;

  const out = new Map<LegalRef, ParsedVerdict>();
  for (const entry of verdicts) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    const citation = obj["citation"];
    const relevant = obj["relevant"];
    const reason = obj["reason"];
    if (typeof citation !== "string") continue;
    if (typeof relevant !== "boolean") continue;
    const verdict: ParsedVerdict = {
      citation: normalizeRef(citation),
      relevant,
    };
    if (typeof reason === "string") verdict.reason = reason;
    out.set(verdict.citation, verdict);
  }
  return out;
}

function buildSystemPrompt(): string {
  return [
    "You are an expert French jurist acting as a strict relevance judge.",
    "Given a legal question, an answer, and the Code civil articles the answer cited,",
    "decide for EACH cited article whether it actually SUPPORTS the answer to the question.",
    "An article is relevant only if it provides genuine legal support for the answer's",
    "conclusion — not merely if it is loosely on-topic.",
    "You must call the report_relevance tool with one verdict per cited article.",
    "",
    "Corpus (available Code civil articles):",
    renderCorpusForPrompt(),
  ].join("\n");
}

/**
 * LLM-as-a-Judge. Asks the model which cited articles support the answer.
 *
 * FAIL-OPEN POLICY: on any error (API failure, malformed output, a citation
 * the model did not return a verdict for) each affected citation defaults to
 * `{ relevant: true }`. The judge measures the AGENT, so a fault in the judge
 * must never fabricate an agent failure — better to under-report than to
 * penalize the agent for the judge's own unreliability. The judge's own
 * reliability is measured separately via calibration.
 */
export function createLLMJudge(opts: {
  model: string;
  provider?: Provider;
  apiKey?: string;
  baseURL?: string;
}): Judge {
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

  async function assess(input: {
    question: string;
    answer: string;
    citations: LegalRef[];
  }): Promise<CitationJudgment[]> {
    const normalized = input.citations.map((c) => normalizeRef(c));

    // Fail-open default: every citation relevant.
    const buildDefault = (): CitationJudgment[] =>
      normalized.map((citation) => ({ citation, relevant: true }));

    let verdicts: Map<LegalRef, ParsedVerdict> | null = null;
    try {
      const userContent = [
        `Question: ${input.question}`,
        "",
        `Answer: ${input.answer}`,
        "",
        `Cited articles: ${normalized.length > 0 ? normalized.join(", ") : "(none)"}`,
      ].join("\n");

      const completion = await client.chat.completions.create({
        model,
        tools: judgeTools,
        tool_choice: "required",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });

      const message = completion.choices[0]?.message;
      const toolCalls = message?.tool_calls ?? [];
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        if (call.function.name !== "report_relevance") continue;
        const parsed = parseVerdicts(call.function.arguments);
        if (parsed !== null) {
          verdicts = parsed;
          break;
        }
      }
    } catch {
      return buildDefault();
    }

    if (verdicts === null) return buildDefault();

    const found = verdicts;
    return normalized.map((citation): CitationJudgment => {
      const verdict = found.get(citation);
      if (verdict === undefined) {
        // No verdict for this citation -> fail-open.
        return { citation, relevant: true };
      }
      const judgment: CitationJudgment = {
        citation,
        relevant: verdict.relevant,
      };
      if (verdict.reason !== undefined) judgment.reason = verdict.reason;
      return judgment;
    });
  }

  return { name: `judge:${model}`, assess };
}

/**
 * Deterministic judge used by tests and no-API-key CLI runs. A citation is
 * relevant iff its normalized form is in the set registered for that exact
 * `question` string. A missing question yields an empty set (all not relevant).
 */
export function staticJudge(
  name: string,
  relevantByQuestion: Map<string, Set<LegalRef>>,
): Judge {
  async function assess(input: {
    question: string;
    answer: string;
    citations: LegalRef[];
  }): Promise<CitationJudgment[]> {
    const relevantSet = relevantByQuestion.get(input.question) ?? new Set<LegalRef>();
    return input.citations.map((raw): CitationJudgment => {
      const citation = normalizeRef(raw);
      return { citation, relevant: relevantSet.has(citation) };
    });
  }
  return { name, assess };
}

/**
 * A deliberately bad judge that marks every citation relevant. Used to
 * demonstrate that calibration catches an unreliable judge (it will show a
 * high false-positive rate against gold labels).
 */
export const alwaysRelevantJudge: Judge = {
  name: "judge:always-relevant",
  async assess(input: {
    question: string;
    answer: string;
    citations: LegalRef[];
  }): Promise<CitationJudgment[]> {
    return input.citations.map((raw): CitationJudgment => ({
      citation: normalizeRef(raw),
      relevant: true,
    }));
  },
};
