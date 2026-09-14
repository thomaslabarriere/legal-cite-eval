import { describe, it, expect } from "vitest";
import type { LegalRef, Question, Judge } from "../src/types.js";
import { questions } from "../src/scenarios/questions.js";
import { judgeGold } from "../src/scenarios/judge_gold.js";
import { runQuestion } from "../src/runner.js";
import { normalizeRef } from "../src/corpus/normalize.js";
import {
  hallucinatorAgent,
  irrelevantCiterAgent,
  unsupportedAgent,
  scriptedAgent,
} from "../src/agent/buggy.js";
import {
  alwaysRelevantJudge,
  parseVerdicts,
  createLLMJudge,
  type ChatClient,
} from "../src/judge/judge.js";
import { createLLMAgent } from "../src/agent/runAgent.js";
import { parseAnswerCall } from "../src/agent/tools.js";
import { questionKeyedStaticJudge } from "../src/judge/static_from_questions.js";
import { calibrateJudge } from "../src/judge/calibration.js";
import {
  keywordRetriever,
  narrowRetriever,
  oracleRetriever,
  reciprocalRankFusion,
} from "../src/corpus/retrieve.js";

function question(id: string): Question {
  const q = questions.find((x) => x.id === id);
  if (!q) throw new Error(`question ${id} not found`);
  return q;
}

const judge = questionKeyedStaticJudge();

// ---------------------------------------------------------------------------
// Mutation proof: each deliberately-broken agent is caught on its metric.
// ---------------------------------------------------------------------------
describe("mutation proof — the harness catches broken legal agents", () => {
  it("catches a hallucinated (non-existent) citation", async () => {
    const r = await runQuestion(hallucinatorAgent, judge, question("faute-delictuelle"));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain("hallucinated_citation");
  });

  it("catches an irrelevant (real but off-topic) citation", async () => {
    const r = await runQuestion(irrelevantCiterAgent, judge, question("faute-delictuelle"));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain("irrelevant_citation");
  });

  it("catches an unsupported claim (answer with no citation)", async () => {
    const r = await runQuestion(unsupportedAgent, judge, question("force-obligatoire"));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain("unsupported_claim");
  });
});

// ---------------------------------------------------------------------------
// Control: a correct agent (cites the key authority) is not falsely flagged.
// ---------------------------------------------------------------------------
describe("control — a correct agent is not falsely flagged", () => {
  const control = scriptedAgent(
    "control:correct",
    questions.map((q) => ({
      match: q.question,
      run: {
        answer: "Answer grounded in the cited Code civil article.",
        citations: q.expected.keyAuthorities,
      },
    })),
  );

  for (const q of questions) {
    it(`passes: ${q.title}`, async () => {
      const r = await runQuestion(control, judge, q);
      expect(r.failures).toEqual([]);
      expect(r.passed).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// RAG retrieval dimension: measure retrieval recall (missed_retrieval).
// Mutation proof for the retriever, mirroring the agent mutation tests.
// ---------------------------------------------------------------------------
describe("RAG — retrieval recall metric grades the retriever", () => {
  const control = scriptedAgent(
    "control:correct",
    questions.map((q) => ({
      match: q.question,
      run: {
        answer: "Answer grounded in the cited Code civil article.",
        citations: q.expected.keyAuthorities,
      },
    })),
  );

  const keyByQuestion = new Map<string, LegalRef[]>(
    questions.map((q) => [q.question, q.expected.keyAuthorities]),
  );

  it("catches a broken retriever that never surfaces the key authority", async () => {
    const r = await runQuestion(control, judge, question("faute-delictuelle"), {
      retriever: narrowRetriever,
      k: 4,
    });
    expect(r.applicableMetrics).toContain("missed_retrieval");
    expect(r.failures).toContain("missed_retrieval");
    expect(r.passed).toBe(false);
    // A retrieval miss is counted ONCE: missed_authority must not also fire
    // (the agent could not cite an article that was never retrieved).
    expect(r.applicableMetrics).not.toContain("missed_authority");
    expect(r.failures).not.toContain("missed_authority");
  });

  it("does not false-positive on an oracle retriever (recall = 100%)", async () => {
    for (const q of questions) {
      const r = await runQuestion(control, judge, q, {
        retriever: oracleRetriever(keyByQuestion),
        k: 4,
      });
      expect(r.applicableMetrics).toContain("missed_retrieval");
      expect(r.failures).not.toContain("missed_retrieval");
      expect(r.trace.retrieved).toContain(q.expected.keyAuthorities[0]);
    }
  });

  it("does not apply the retrieval metric outside RAG mode", async () => {
    const r = await runQuestion(control, judge, question("faute-delictuelle"));
    expect(r.applicableMetrics).not.toContain("missed_retrieval");
    expect(r.trace.retrieved).toBeUndefined();
  });

  it("the lexical baseline retriever returns ranked, capped candidates", async () => {
    const retriever = keywordRetriever();
    for (const q of questions) {
      const got = await retriever.retrieve(q.question, 4);
      expect(got.length).toBeGreaterThan(0);
      expect(got.length).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Reciprocal-rank fusion: the hybrid retriever's core. Pure, deterministic.
// ---------------------------------------------------------------------------
describe("reciprocal-rank fusion", () => {
  it("rewards agreement across rankings over a single high rank", () => {
    // "b" is rank 2 in BOTH lists; "a" and "c" are each rank 1 in one list only.
    // RRF should rank the item both retrievers agree on (b) first — this is the
    // whole point of fusing lexical and semantic rankings.
    const lex = ["a", "b"];
    const sem = ["c", "b"];
    const fused = reciprocalRankFusion([lex, sem]);
    expect(fused[0]).toBe("b");
    // a and c tie (rank 1 in one list each) -> ascending id, a before c.
    expect(fused).toEqual(["b", "a", "c"]);
  });

  it("is order-independent and breaks ties by ascending id", () => {
    expect(reciprocalRankFusion([["x"], ["y"]])).toEqual(["x", "y"]);
    expect(reciprocalRankFusion([["y"], ["x"]])).toEqual(["x", "y"]);
  });

  it("a single ranking is returned in its own order", () => {
    expect(reciprocalRankFusion([["c", "a", "b"]])).toEqual(["c", "a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Judge calibration: the differentiator. Calibration must catch a bad judge.
// The gold labels are authored INDEPENDENTLY of the keyAuthorities signal the
// static judge keys on (see judge_gold.ts), so this measures something real
// rather than being self-fulfilling. (Who judges the judge?)
// ---------------------------------------------------------------------------
describe("judge calibration catches an unreliable judge", () => {
  it("flags a judge that calls everything relevant (false positives > 0)", async () => {
    const cal = await calibrateJudge(alwaysRelevantJudge, judgeGold);
    expect(cal.falsePositive).toBeGreaterThan(0);
    expect(cal.agreementRate).toBeLessThan(1);
  });

  it("de-circularization: the gold has hard cases where relevance and keyAuthority-membership diverge in BOTH directions", async () => {
    // If the gold were just "relevant = is-a-keyAuthority", the answer-blind
    // static judge would agree everywhere (circular, ~100%). Because labels are
    // decoupled from keyAuthorities, the static judge now makes genuine errors:
    //  - false negatives on near-miss authorities it cannot credit, and
    //  - false positives when the right article is cited under a wrong answer.
    // A judge keyed only on (question, citation) CANNOT fix these — relevance
    // depends on the answer — which is exactly the weakness calibration exposes.
    const cal = await calibrateJudge(questionKeyedStaticJudge(), judgeGold);
    expect(cal.total).toBe(36);
    expect(cal.falsePositive).toBeGreaterThan(0);
    expect(cal.falseNegative).toBeGreaterThan(0);
    expect(cal.agreementRate).toBeLessThan(1);
    // Regression guard: exact measured counts from the real gold set (not a
    // tuned target — these are whatever the honest labels produce). 36 items:
    // 23 agree, 6 false positives (right article, wrong answer), 7 false
    // negatives (near-miss authorities) -> 64% agreement for the answer-blind
    // static judge.
    expect(cal.falsePositive).toBe(6);
    expect(cal.falseNegative).toBe(7);
    expect(cal.agree).toBe(23);
  });

  it("the static judge still RECOGNIZES the verbatim question text (no drift)", async () => {
    // The gold reuses the exact questions.ts strings, so the no-key CLI judge
    // sees them. If the strings drifted, the judge would return no verdict for
    // every item and fail open to relevant=true everywhere — which would zero
    // out its false negatives. Their presence proves recognition still holds.
    const cal = await calibrateJudge(questionKeyedStaticJudge(), judgeGold);
    expect(cal.falseNegative).toBeGreaterThan(0);
  });

  it("an ANSWER-AWARE oracle judge scores perfect agreement (the ceiling a key-authority judge cannot reach)", async () => {
    // Keyed on the full (question, answer, citation) triple, so it can tell the
    // near-miss and wrong-answer cases apart. Demonstrates the gold is
    // internally consistent and that the static judge's errors are a property
    // of its answer-blindness, not of noisy labels.
    const relevantByTriple = new Set<string>();
    const key = (question: string, answer: string, citation: LegalRef): string =>
      `${question} ${answer} ${normalizeRef(citation)}`;
    for (const item of judgeGold) {
      if (item.relevant) relevantByTriple.add(key(item.question, item.answer, item.citation));
    }
    const oracle: Judge = {
      name: "judge:answer-aware-oracle",
      async assess(input) {
        return input.citations.map((raw) => ({
          citation: normalizeRef(raw),
          relevant: relevantByTriple.has(key(input.question, input.answer, raw)),
        }));
      },
    };
    const cal = await calibrateJudge(oracle, judgeGold);
    expect(cal.agreementRate).toBe(1);
    expect(cal.falsePositive).toBe(0);
    expect(cal.falseNegative).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LLM-path stub tests (0 API credits). Exercise the LLM judge/agent code
// paths that a live run uses — the pure parsers and the fail-open seam —
// WITHOUT any network call, so "validated" covers the LLM path too and not
// only the deterministic judge. No API key is read: a fake client is injected.
// ---------------------------------------------------------------------------

/** Build a ChatClient whose chat.completions.create runs the given impl. */
function fakeChatClient(create: () => Promise<unknown>): ChatClient {
  return {
    chat: { completions: { create } },
  } as unknown as ChatClient;
}

/** A completion carrying a single function tool call. */
function toolCallCompletion(name: string, args: unknown): unknown {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

describe("LLM judge — pure verdict parser (parseVerdicts)", () => {
  it("parses valid tool-call JSON into normalized verdicts", () => {
    const map = parseVerdicts(
      JSON.stringify({
        verdicts: [
          { citation: "art. 1240", relevant: false, reason: "off point" },
          { citation: "1103", relevant: true },
        ],
      }),
    );
    expect(map).not.toBeNull();
    expect(map?.get("1240")).toEqual({ citation: "1240", relevant: false, reason: "off point" });
    expect(map?.get("1103")).toEqual({ citation: "1103", relevant: true });
  });

  it("returns null on malformed / non-conforming JSON", () => {
    expect(parseVerdicts("not json at all")).toBeNull();
    expect(parseVerdicts("42")).toBeNull();
    expect(parseVerdicts(JSON.stringify({ verdicts: "nope" }))).toBeNull();
    expect(parseVerdicts(JSON.stringify({ nope: [] }))).toBeNull();
  });

  it("skips individual malformed entries rather than failing the whole parse", () => {
    const map = parseVerdicts(
      JSON.stringify({
        verdicts: [
          { citation: "1240", relevant: true },
          { citation: 1240, relevant: true }, // citation not a string -> skipped
          { citation: "1103", relevant: "yes" }, // relevant not a boolean -> skipped
          null,
        ],
      }),
    );
    expect(map).not.toBeNull();
    expect(map?.size).toBe(1);
    expect(map?.get("1240")).toEqual({ citation: "1240", relevant: true });
  });
});

describe("LLM agent — pure tool-call parser (parseAnswerCall)", () => {
  it("parses a valid answer_question call", () => {
    const run = parseAnswerCall(
      "answer_question",
      JSON.stringify({ answer: "Oui.", citations: ["1103", "1104"] }),
    );
    expect(run).toEqual({ answer: "Oui.", citations: ["1103", "1104"] });
  });

  it("returns null for the wrong tool name or malformed args", () => {
    expect(parseAnswerCall("something_else", JSON.stringify({ answer: "x", citations: [] }))).toBeNull();
    expect(parseAnswerCall("answer_question", "not json")).toBeNull();
    expect(parseAnswerCall("answer_question", JSON.stringify({ answer: 1, citations: [] }))).toBeNull();
    expect(parseAnswerCall("answer_question", JSON.stringify({ answer: "x", citations: "no" }))).toBeNull();
    expect(parseAnswerCall("answer_question", JSON.stringify({ answer: "x", citations: [1, 2] }))).toBeNull();
  });
});

describe("LLM judge — fail-safe seam (injected client, 0 API calls)", () => {
  it("honors a genuine model verdict (does not fabricate relevance)", async () => {
    const judge = createLLMJudge({
      model: "fake",
      client: fakeChatClient(async () =>
        toolCallCompletion("report_relevance", {
          verdicts: [{ citation: "1240", relevant: false, reason: "off point" }],
        }),
      ),
    });
    const out = await judge.assess({ question: "q", answer: "a", citations: ["1240"] });
    expect(out).toEqual([{ citation: "1240", relevant: false, reason: "off point" }]);
  });

  it("fails SAFE (uncertain, NOT relevant=true) when the client throws", async () => {
    // A judge outage must not read as "citation OK" (old fail-open bug), nor as
    // a fabricated agent failure. It is unverified -> uncertain. (DECISIONS #6)
    const judge = createLLMJudge({
      model: "fake",
      client: fakeChatClient(async () => {
        throw new Error("network down");
      }),
    });
    const out = await judge.assess({ question: "q", answer: "a", citations: ["1240", "544"] });
    expect(out).toEqual([
      { citation: "1240", relevant: false, uncertain: true },
      { citation: "544", relevant: false, uncertain: true },
    ]);
  });

  it("fails SAFE (uncertain) when the model returns malformed tool arguments", async () => {
    const judge = createLLMJudge({
      model: "fake",
      client: fakeChatClient(async () => toolCallCompletion("report_relevance", "}{ not json")),
    });
    const out = await judge.assess({ question: "q", answer: "a", citations: ["1240"] });
    expect(out).toEqual([{ citation: "1240", relevant: false, uncertain: true }]);
  });
});

describe("LLM agent — fail-safe seam (injected client, 0 API calls)", () => {
  it("parses a valid tool call from the injected client", async () => {
    const agent = createLLMAgent({
      model: "fake",
      client: fakeChatClient(async () =>
        toolCallCompletion("answer_question", { answer: "Oui.", citations: ["1103"] }),
      ),
    });
    const run = await agent.run({ question: "q" });
    expect(run.answer).toBe("Oui.");
    expect(run.citations).toEqual(["1103"]);
  });

  it("a throwing client surfaces as an agent_error, never a fabricated pass", async () => {
    const agent = createLLMAgent({
      model: "fake",
      client: fakeChatClient(async () => {
        throw new Error("network down");
      }),
    });
    const r = await runQuestion(agent, questionKeyedStaticJudge(), question("dol"));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain("agent_error");
  });
});
