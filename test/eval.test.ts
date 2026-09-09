import { describe, it, expect } from "vitest";
import type { LegalRef, Question } from "../src/types.js";
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
import { staticJudge, alwaysRelevantJudge } from "../src/judge/judge.js";
import { questionKeyedStaticJudge } from "../src/judge/static_from_questions.js";
import { calibrateJudge } from "../src/judge/calibration.js";

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
// Judge calibration: the differentiator. Calibration must catch a bad judge,
// and a gold-aligned judge must score perfectly. (Who judges the judge?)
// ---------------------------------------------------------------------------
describe("judge calibration catches an unreliable judge", () => {
  it("flags a judge that calls everything relevant (false positives > 0)", async () => {
    const cal = await calibrateJudge(alwaysRelevantJudge, judgeGold);
    expect(cal.falsePositive).toBeGreaterThan(0);
    expect(cal.agreementRate).toBeLessThan(1);
  });

  it("the offline demo judge (key-authorities, keyed on the exact questions) is well-calibrated against the gold set", async () => {
    // Regression guard: the gold set must reuse the verbatim questions.ts
    // strings, so the CLI's no-key judge recognizes them. If they drift, this
    // agreement collapses (the exact bug two reviews caught).
    const cal = await calibrateJudge(questionKeyedStaticJudge(), judgeGold);
    expect(cal.falsePositive).toBe(0);
    expect(cal.agreementRate).toBeGreaterThanOrEqual(0.8);
  });

  it("scores a gold-aligned judge at perfect agreement", async () => {
    const relevantByQuestion = new Map<string, Set<LegalRef>>();
    for (const item of judgeGold) {
      const set = relevantByQuestion.get(item.question) ?? new Set<LegalRef>();
      if (item.relevant) set.add(normalizeRef(item.citation));
      relevantByQuestion.set(item.question, set);
    }
    const aligned = staticJudge("judge:gold-aligned", relevantByQuestion);
    const cal = await calibrateJudge(aligned, judgeGold);
    expect(cal.agreementRate).toBe(1);
    expect(cal.falsePositive).toBe(0);
    expect(cal.falseNegative).toBe(0);
  });
});
