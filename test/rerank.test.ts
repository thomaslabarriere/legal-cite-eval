import { describe, it, expect } from "vitest";
import type { LegalRef, Question } from "../src/types.js";
import { questions } from "../src/scenarios/questions.js";
import { runQuestion } from "../src/runner.js";
import { topCitedAgent } from "../src/agent/buggy.js";
import { questionKeyedStaticJudge } from "../src/judge/static_from_questions.js";
import type { Retriever } from "../src/corpus/retrieve.js";
import {
  lexicalReranker,
  llmReranker,
  parseChoiceIndex,
  type ChatClient,
} from "../src/corpus/rerank.js";

function question(id: string): Question {
  const q = questions.find((x) => x.id === id);
  if (!q) throw new Error(`question ${id} not found`);
  return q;
}

const judge = questionKeyedStaticJudge();

/** A retriever that always returns a fixed shortlist, in a fixed order. */
function fixedRetriever(order: LegalRef[]): Retriever {
  return {
    name: "retriever:fixed",
    async retrieve(_q: string, k: number): Promise<LegalRef[]> {
      return order.slice(0, k);
    },
  };
}

// The "vie-privee" question: key authority is art. 9 ("Respect de la vie
// privée"), whose label shares "vie"/"privée" with the question. Art. 544
// ("Droit de propriété") is an off-topic distractor with no such overlap.
// First-stage order puts the distractor at rank 1; the cite-top agent then
// cites whatever leads the shortlist.
const q = question("vie-privee");
const shortlistDistractorFirst: LegalRef[] = ["544", "9"];

describe("reranker is WIRED IN — reordering flips the citation and the attribution", () => {
  it("without a reranker: the agent cites the rank-1 distractor and is faulted", async () => {
    const r = await runQuestion(topCitedAgent, judge, q, {
      retriever: fixedRetriever(shortlistDistractorFirst),
      k: 4,
    });
    // Agent cited 544 (the distractor at rank 1), not the key authority 9.
    expect(r.trace.citations).toEqual(["544"]);
    expect(r.trace.retrieved?.[0]).toBe("544");
    // Attribution: a real-but-off-topic citation + the key authority missed.
    expect(r.failures).toContain("irrelevant_citation");
    expect(r.failures).toContain("missed_authority");
    expect(r.passed).toBe(false);
  });

  it("with the lexical reranker: the on-point article leads, the citation flips to it, and the faults clear", async () => {
    const r = await runQuestion(topCitedAgent, judge, q, {
      retriever: fixedRetriever(shortlistDistractorFirst),
      k: 4,
      reranker: lexicalReranker(),
    });
    // The reranker promoted 9 (label overlaps the question) above 544.
    expect(r.trace.retrieved?.[0]).toBe("9");
    // The citation FOLLOWED the reorder — this is the wired-in effect, not len().
    expect(r.trace.citations).toEqual(["9"]);
    expect(r.failures).not.toContain("irrelevant_citation");
    expect(r.failures).not.toContain("missed_authority");
    expect(r.passed).toBe(true);
  });
});

describe("llm reranker — pure choice parser (parseChoiceIndex)", () => {
  it("reads a bare or embedded index within range", () => {
    expect(parseChoiceIndex("1", 2)).toBe(1);
    expect(parseChoiceIndex("Index: 0 is best", 2)).toBe(0);
  });
  it("rejects out-of-range or absent indices", () => {
    expect(parseChoiceIndex("5", 2)).toBeNull();
    expect(parseChoiceIndex("none", 2)).toBeNull();
  });
});

/** Build a ChatClient whose chat.completions.create runs the given impl. */
function fakeChatClient(create: () => Promise<unknown>): ChatClient {
  return { chat: { completions: { create } } } as unknown as ChatClient;
}

function contentCompletion(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

describe("llm reranker — injected client, 0 API calls", () => {
  it("moves the model's chosen candidate to rank 1", async () => {
    const reranker = llmReranker({
      model: "fake",
      client: fakeChatClient(async () => contentCompletion("1")),
    });
    const out = await reranker.rerank("q", ["544", "9", "1240"]);
    expect(out).toEqual(["9", "544", "1240"]);
  });

  it("fails OPEN (keeps first-stage order) when the client throws", async () => {
    const reranker = llmReranker({
      model: "fake",
      client: fakeChatClient(async () => {
        throw new Error("network down");
      }),
    });
    const out = await reranker.rerank("q", ["544", "9"]);
    expect(out).toEqual(["544", "9"]);
  });

  it("fails OPEN on an out-of-range / unparseable reply", async () => {
    const reranker = llmReranker({
      model: "fake",
      client: fakeChatClient(async () => contentCompletion("garbage")),
    });
    const out = await reranker.rerank("q", ["544", "9"]);
    expect(out).toEqual(["544", "9"]);
  });
});
