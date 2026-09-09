#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Judge, LegalAgent, Scorecard } from "./types.js";
import { questions } from "./scenarios/questions.js";
import { judgeGold } from "./scenarios/judge_gold.js";
import { runQuestions } from "./runner.js";
import type { RetrievalOptions } from "./runner.js";
import { keywordRetriever } from "./corpus/retrieve.js";
import { buildScorecard, renderScorecard } from "./eval/scorecard.js";
import { createLLMAgent } from "./agent/runAgent.js";
import type { Provider } from "./agent/runAgent.js";
import { createLLMJudge } from "./judge/judge.js";
import { questionKeyedStaticJudge } from "./judge/static_from_questions.js";
import { calibrateJudge } from "./judge/calibration.js";
import { sendTraces } from "./obs/langfuse.js";
import {
  hallucinatorAgent,
  irrelevantCiterAgent,
  unsupportedAgent,
} from "./agent/buggy.js";

const BUGGY: Record<string, LegalAgent> = {
  hallucinator: hallucinatorAgent,
  "irrelevant-citer": irrelevantCiterAgent,
  unsupported: unsupportedAgent,
};

const DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-4o",
  openrouter: "anthropic/claude-3.7-sonnet",
};

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

const DEFAULT_RAG_K = 4;

async function writeOut(out: string, data: unknown): Promise<void> {
  const dir = dirname(out);
  if (dir && dir !== ".") await mkdir(dir, { recursive: true });
  await writeFile(out, JSON.stringify(data, null, 2), "utf8");
  console.log(`\nScorecard written to ${out}`);
}

function usage(): void {
  console.log(
    [
      "legal-cite-eval — citation-reliability evaluation for legal LLM agents",
      "  (hallucinated/irrelevant citations, retrieval recall, judge calibration, cost & latency)",
      "",
      "Usage:",
      "  legal-cite-eval run [--provider openai|openrouter] [--model <model>]",
      "  legal-cite-eval run --models <m1,m2,...>      # compare several models",
      "  legal-cite-eval run --rag [--k <n>]           # retrieve-then-cite + recall metric",
      "  legal-cite-eval run --agent buggy:<name>      # no API key needed",
      "",
      "Keys (set one): OPENAI_API_KEY  or  OPENROUTER_API_KEY",
      "Optional tracing: LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY",
      "",
      `Buggy agents: ${Object.keys(BUGGY).map((n) => `buggy:${n}`).join(", ")}`,
    ].join("\n"),
  );
}

function resolveProvider(args: string[]): Provider {
  const flag = getFlag(args, "provider");
  if (flag === "openai" || flag === "openrouter") return flag;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  throw new Error(
    "No API key found. Set OPENAI_API_KEY or OPENROUTER_API_KEY, or use --agent buggy:<name>.",
  );
}

async function evalAgent(
  agent: LegalAgent,
  judge: Judge,
  model: string | undefined,
  retrieval?: RetrievalOptions,
): Promise<Scorecard> {
  const mode = retrieval ? " [RAG]" : "";
  console.log(`\nRunning ${questions.length} questions against ${agent.name} (judge: ${judge.name})${mode}...`);
  const results = await runQuestions(agent, judge, questions, retrieval);
  const calibration = await calibrateJudge(judge, judgeGold);
  const scorecard = buildScorecard(agent.name, model, results, {
    judgeCalibration: calibration,
    ...(retrieval ? { ragMode: true } : {}),
  });
  console.log(renderScorecard(scorecard));
  await sendTraces(agent.name, model, results);
  return scorecard;
}

function renderComparison(cards: Scorecard[]): string {
  const rows = cards
    .map(
      (c) =>
        `  ${(c.model ?? c.agentName).padEnd(32)} ${String(c.reliabilityScore).padStart(3)}/100   ${c.passed}/${c.totalQuestions} passed`,
    )
    .join("\n");
  return ["", "=".repeat(64), "Model comparison", "-".repeat(64), rows, "=".repeat(64)].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "run") {
    usage();
    process.exit(args[0] ? 1 : 0);
  }

  const out = getFlag(args, "out") ?? "scorecard.json";

  // RAG mode: retrieve-then-cite over the full corpus with the lexical
  // baseline retriever, and grade retrieval recall (missed_retrieval).
  const ragK = Number(getFlag(args, "k") ?? DEFAULT_RAG_K);
  const retrieval: RetrievalOptions | undefined = hasFlag(args, "rag")
    ? { retriever: keywordRetriever(), k: Number.isFinite(ragK) && ragK > 0 ? ragK : DEFAULT_RAG_K }
    : undefined;

  // Buggy agent: no API key; judged deterministically by the static judge.
  const agentFlag = getFlag(args, "agent");
  if (agentFlag) {
    const name = agentFlag.replace(/^buggy:/, "");
    const agent = BUGGY[name];
    if (!agent) {
      throw new Error(
        `Unknown agent "${agentFlag}". Available: ${Object.keys(BUGGY).map((n) => `buggy:${n}`).join(", ")}`,
      );
    }
    await writeOut(out, await evalAgent(agent, questionKeyedStaticJudge(), undefined, retrieval));
    return;
  }

  const provider = resolveProvider(args);
  const makeJudge = (model: string): Judge => createLLMJudge({ model, provider });

  const modelsFlag = getFlag(args, "models");
  if (modelsFlag !== undefined) {
    const models = modelsFlag.split(",").map((m) => m.trim()).filter(Boolean);
    if (models.length === 0) {
      throw new Error('--models is empty; pass e.g. --models "gpt-4o,gpt-4o-mini"');
    }
    const cards: Scorecard[] = [];
    for (const model of models) {
      cards.push(await evalAgent(createLLMAgent({ model, provider }), makeJudge(model), model, retrieval));
    }
    console.log(renderComparison(cards));
    await writeOut(out, cards);
    return;
  }

  const model = getFlag(args, "model") ?? DEFAULT_MODEL[provider];
  await writeOut(out, await evalAgent(createLLMAgent({ model, provider }), makeJudge(model), model, retrieval));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
