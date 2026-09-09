# LegalCiteEval

**Citation-reliability evaluation for legal LLM agents — with a validated LLM-as-a-Judge.**

A legal agent is only trustworthy if it cites real authorities that actually support its answer, and doesn't assert conclusions with no basis. LegalCiteEval scores an agent on a set of ground-truth Code civil questions: hallucinated citations and missing key authorities are checked **objectively** against a public corpus, while citation *relevance* is assessed by an **LLM-as-a-Judge** — whose own reliability is then **measured against a labelled gold set**. Because the first question about any judge is: *who judges the judge?*

> **Scope.** Not legal advice, not an authority on French law. The corpus is a small **public** subset of the Code civil, the questions are **synthetic**, and there is no client data. The value is the evaluation instrument — including judge calibration — not the legal content. Plug in your own eval sets for real numbers.

## Quick start (no API key needed)

```bash
npm install
npx tsx src/cli.ts run --agent buggy:hallucinator
```

Buggy agents are judged by a deterministic static judge, so the harness runs fully offline.

## Run against a real model

```bash
export OPENAI_API_KEY=sk-...           # the only thing needed to go live
npx tsx src/cli.ts run --model gpt-4o
# compare models:
npx tsx src/cli.ts run --models gpt-4o,gpt-4o-mini
# retrieve-then-cite (RAG) + retrieval-recall metric:
npx tsx src/cli.ts run --model gpt-4o --rag
```

With a key, an LLM agent answers and an LLM-as-a-Judge assesses relevance; the run also reports that judge's calibration against the gold set. Everything is wired — **set `OPENAI_API_KEY` and the commands above produce a real scorecard, real judge calibration, and real cost/latency numbers**; nothing else to configure. Optional Langfuse tracing via `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (silent no-op otherwise).

### Cost & latency

Every real-model run reports token usage, an illustrative dollar estimate (list price, agent calls only), average per-question latency, and throughput — the operational signal you need alongside quality:

```
Cost & latency
  Tokens: 3840 (prompt 3360 / completion 480)
  Est. cost: $0.0132 (illustrative list price, agent only)
  Latency: 0.91s/question avg (7.24s total)
  Throughput: 1.10 questions/s
```

### RAG mode (retrieve-then-cite)

`--rag` inserts a retrieval step: a lexical baseline retriever narrows the corpus to the top-`k` candidate articles (`--k`, default 4), the agent sees **only** those and may cite only from them, and a new **`missed_retrieval`** metric grades retrieval recall — *did the retriever even surface the key authority the answer turns on?* If it didn't, the agent could never cite it, so this failure caps the ceiling. Swap in an embedding/reranking retriever behind the same `Retriever` interface and the metric grades it unchanged.

## What it measures

| Metric | Failure it catches | Weight |
|---|---|---|
| `hallucinated_citation` | cites an article that doesn't exist in the corpus | 3 |
| `irrelevant_citation` | cites a real article that doesn't support the answer (judged) | 3 |
| `unsupported_claim` | gives an answer with no citation at all | 2 |
| `missed_authority` | omits the key article the question turns on | 2 |
| `missed_retrieval` | (RAG mode) the retriever never surfaced the key authority — recall failure | 3 |
| `agent_error` | the agent run threw — isolated per question, never aborts the run | 2 |

Hallucination and missing-authority are objective (corpus membership). Relevance is the judge's call — and the scorecard's **Judge calibration** section shows how often that judge agrees with the labelled gold set (and its false-positive / false-negative counts), so you know how much to trust the relevance verdicts.

## Why you can trust the harness (mutation proof)

`test/eval.test.ts` runs deliberately-broken agents (hallucinator, irrelevant-citer, unsupported) and asserts each is caught on the right metric, that a correct agent passes every question, and — crucially — that **calibration catches an unreliable judge** (a judge that calls everything relevant is flagged with false positives; a gold-aligned judge scores perfect agreement). The same mutation-proof discipline covers retrieval: a broken retriever that never surfaces the key authority is caught by `missed_retrieval`, while an oracle retriever is not falsely flagged.

```bash
npm test
```

## Layout

```
src/
  types.ts            # shared contracts (incl. the Judge interface)
  corpus/             # public Code civil subset + normalization + retrieval (RAG)
  agent/              # legal agent (OpenAI / OpenRouter) + buggy agents
  judge/              # LLM-as-a-Judge + static judge + calibration
  scenarios/          # 8 questions + judge gold set
  eval/               # metrics, evaluator, scorecard
  runner.ts · cli.ts · obs/langfuse.ts
test/                 # mutation-proof + calibration tests
```

## License

MIT
