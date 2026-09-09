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
export OPENAI_API_KEY=sk-...
npx tsx src/cli.ts run --model gpt-4o
# compare models:
npx tsx src/cli.ts run --models gpt-4o,gpt-4o-mini
```

With a key, an LLM agent answers and an LLM-as-a-Judge assesses relevance; the run also reports that judge's calibration against the gold set. Optional Langfuse tracing via `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (silent no-op otherwise).

## What it measures

| Metric | Failure it catches | Weight |
|---|---|---|
| `hallucinated_citation` | cites an article that doesn't exist in the corpus | 3 |
| `irrelevant_citation` | cites a real article that doesn't support the answer (judged) | 3 |
| `unsupported_claim` | gives an answer with no citation at all | 2 |
| `missed_authority` | omits the key article the question turns on | 2 |
| `agent_error` | the agent run threw — isolated per question, never aborts the run | 2 |

Hallucination and missing-authority are objective (corpus membership). Relevance is the judge's call — and the scorecard's **Judge calibration** section shows how often that judge agrees with the labelled gold set (and its false-positive / false-negative counts), so you know how much to trust the relevance verdicts.

## Why you can trust the harness (mutation proof)

`test/eval.test.ts` runs deliberately-broken agents (hallucinator, irrelevant-citer, unsupported) and asserts each is caught on the right metric, that a correct agent passes every question, and — crucially — that **calibration catches an unreliable judge** (a judge that calls everything relevant is flagged with false positives; a gold-aligned judge scores perfect agreement).

```bash
npm test
```

## Layout

```
src/
  types.ts            # shared contracts (incl. the Judge interface)
  corpus/             # public Code civil subset + citation normalization/existence
  agent/              # legal agent (OpenAI / OpenRouter) + buggy agents
  judge/              # LLM-as-a-Judge + static judge + calibration
  scenarios/          # 8 questions + judge gold set
  eval/               # metrics, evaluator, scorecard
  runner.ts · cli.ts · obs/langfuse.ts
test/                 # mutation-proof + calibration tests
```

## License

MIT
