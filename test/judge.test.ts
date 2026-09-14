import { describe, it, expect } from "vitest";
import type { ChatClient } from "../src/judge/judge.js";
import { createLLMJudge } from "../src/judge/judge.js";
import { calibrateJudge } from "../src/judge/calibration.js";
import type { Judge, JudgeGoldItem, LegalRef, CitationJudgment } from "../src/types.js";

// A fake chat client so the LLM judge's failure/partial paths can be tested
// with ZERO API calls. It returns whatever completion we hand it, or throws.
function fakeClient(
  behaviour: { throws: true } | { verdicts: unknown },
): ChatClient {
  return {
    chat: {
      completions: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: async (): Promise<any> => {
          if ("throws" in behaviour) throw new Error("api down");
          return {
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "report_relevance",
                        arguments: JSON.stringify({ verdicts: behaviour.verdicts }),
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    },
  } as unknown as ChatClient;
}

describe("LLM judge fails SAFE (uncertain) on a partial verdict", () => {
  // The throw / malformed-args cases live in eval.test.ts; this covers the
  // partial case: the model judged some citations but not others.
  it("marks a citation uncertain when the model returns no verdict for it", async () => {
    // Model verdicts cover 1240 only; 1103 was asked about but not judged.
    const judge = createLLMJudge({
      model: "test",
      client: fakeClient({ verdicts: [{ citation: "1240", relevant: true }] }),
    });
    const out = await judge.assess({
      question: "q",
      answer: "a",
      citations: ["1240", "1103"],
    });
    const byId = new Map(out.map((j) => [j.citation, j]));
    expect(byId.get("1240")).toMatchObject({ relevant: true });
    expect(byId.get("1240")?.uncertain).not.toBe(true);
    expect(byId.get("1103")).toMatchObject({ relevant: false, uncertain: true });
  });
});

describe("calibration excludes uncertain verdicts from the rate", () => {
  const gold: JudgeGoldItem[] = [
    { question: "q1", answer: "a1", citation: "1240", relevant: true },
    { question: "q2", answer: "a2", citation: "1103", relevant: false },
    { question: "q3", answer: "a3", citation: "1195", relevant: true },
  ];

  it("a fully-uncertain judge scores rate 1 over ZERO verified items, uncertain=all", async () => {
    const alwaysUncertain: Judge = {
      name: "judge:always-uncertain",
      async assess(input) {
        return input.citations.map((c): CitationJudgment => ({
          citation: c as LegalRef,
          relevant: false,
          uncertain: true,
        }));
      },
    };
    const cal = await calibrateJudge(alwaysUncertain, gold);
    expect(cal.uncertain).toBe(3);
    expect(cal.agree).toBe(0);
    expect(cal.falsePositive).toBe(0);
    expect(cal.falseNegative).toBe(0);
    // No verified item was turned into a fabricated false positive.
  });

  it("uncertain items are dropped from the denominator, not scored as agreement", async () => {
    // Verifies q1 correctly (relevant), is uncertain on q2, verifies q3.
    const partial: Judge = {
      name: "judge:partial",
      async assess(input) {
        return input.citations.map((c): CitationJudgment => {
          if (c === "1103") return { citation: c, relevant: false, uncertain: true };
          return { citation: c as LegalRef, relevant: true };
        });
      },
    };
    const cal = await calibrateJudge(partial, gold);
    expect(cal.uncertain).toBe(1);
    expect(cal.agree).toBe(2); // q1 + q3
    expect(cal.falsePositive).toBe(0);
    expect(cal.agreementRate).toBe(1); // 2 / (3 - 1) verified
  });
});
