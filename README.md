# LegalCiteEval

**Citation-reliability evaluation for legal LLM agents, with a calibrated LLM-as-a-Judge.**

A legal agent is only trustworthy if it cites real authorities that actually support its answer, and doesn't assert conclusions with no basis. LegalCiteEval scores an agent on a set of ground-truth Code civil questions: hallucinated citations and missing key authorities are checked **objectively** against a public corpus, while citation *relevance* is assessed by an **LLM-as-a-Judge**, whose own reliability is then **measured against a hand-labelled gold set authored independently of the signal the offline judge keys on**. Because the first question about any judge is: *who judges the judge?*

> **Scope.** Not legal advice, not an authority on French law. The corpus is a small **public** subset of the Code civil, the questions are **synthetic**, and there is no client data. The value is the evaluation instrument, including judge calibration, not the legal content. Plug in your own eval sets for real numbers.

> **On the word "agent".** The thing under test is a **one-shot classifier/verifier**, not an autonomous agent: the real-model path is a single `chat.completions.create` call with one `answer_question` tool and no planning, memory, or multi-step tool loop (in `--rag` mode the chosen retriever, and an optional reranker, run once before that single call). Where the code and this README say "agent" it is only a loose label for "the thing being evaluated"; the `buggy:*` fixtures are plain, network-free functions. Plug in a genuinely agentic answerer and the same harness still applies — it only grades the answer and citations returned.

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
# choose the retriever, add a reranker:
npx tsx src/cli.ts run --model gpt-4o --retriever semantic --reranker lexical
# compare retriever recall (offline, no key needed):
npx tsx src/cli.ts retrievers
# chunk-vs-whole context reduction (analysis, offline):
npx tsx src/cli.ts chunks
```

With a key, an LLM agent answers and an LLM-as-a-Judge assesses relevance; the run also reports that judge's calibration against the gold set. Everything is wired, **set `OPENAI_API_KEY` and the commands above produce a real scorecard, real judge calibration, and real cost/latency numbers**; nothing else to configure. Optional Langfuse tracing via `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (silent no-op otherwise).

### Cost & latency

Every real-model run reports token usage, an illustrative dollar estimate (list price, agent calls only), average per-question latency, and throughput, the operational signal you need alongside quality:

```
Cost & latency
  Tokens: 3840 (prompt 3360 / completion 480)
  Est. cost: $0.0132 (illustrative list price, agent only)
  Latency: 0.91s/question avg (7.24s total)
  Throughput: 1.10 questions/s
```

### RAG mode (retrieve-then-cite) and retrieval depth

`--rag` inserts a retrieval step: a retriever narrows the corpus to the top-`k` candidate articles (`--k`, default 4), the agent sees **only** those and may cite only from them, and a **`missed_retrieval`** metric grades retrieval recall — *did the retriever even surface the key authority the answer turns on?* If it didn't, the agent could never cite it, so this failure caps the ceiling.

Three retrievers sit behind one `Retriever` interface and pass through the **same** diagnostic (`--retriever`, default `keyword`):

- **`keyword`** — a lexical token-overlap baseline over the short article **label**, with a small domain-synonym boost.
- **`semantic`** — embeddings + cosine over the fuller article **text** (label + gloss). Real OpenAI embeddings behind `OPENAI_API_KEY`, or a deterministic **offline hashed bag-of-words** embedder with no key.
- **`hybrid`** — reciprocal-rank fusion (RRF) of the lexical and semantic rankings (rank-based, so no score normalization).

`retrievers` compares their recall on the labelled question set. Because the corpus deliberately includes **hard paraphrased questions** whose vocabulary misses the key article's terse label (and semantic distractors that trap the lexical baseline), the recall is not saturated. Offline (deterministic, no key):

```
Retrieval recall @k=4 on 12 labelled questions (embedder: hashing, OFFLINE)
  keyword    recall  58%  (7/12)   missed: dol, violence-economique, force-majeure, devoir-information, execution-forcee
  semantic   recall  67%  (8/12)
  hybrid     recall  67%  (8/12)
```

The lexical baseline misses **all four hard paraphrases**; the embedding path picks them up. **Read this delta for exactly what it is, and no more.** The lexical retriever indexes only each article's short `label`; the semantic one indexes `label + gloss`, and glosses were added *only* on the four hard-question articles, phrased close to the question. With the offline hashed bag-of-words embedder (no real semantic generalization), the "semantic recovery" is therefore mostly lexical overlap between the question and a gloss I wrote to match it. So this number does **not** prove embeddings help on real legal retrieval; it proves the `missed_retrieval` metric correctly *attributes* a recall gap when one exists (a fabricated one here). With a real key, `text-embedding-3-small` gives keyword 58% / semantic 75% / hybrid 75% (n=1, non-deterministic) — and there **`hybrid` does not beat `semantic`**: it matches the count but regresses on two hard questions (RRF lets a distractor the lexical ranks high drag the key article below `k`). Use `semantic`; `hybrid` is wired in for completeness, not because it wins here. Set `OPENAI_API_KEY` for real numbers.

**Reranker** (`--reranker lexical|llm`). A reranker reorders the retrieved shortlist **before** the agent cites, so it changes *which* article the agent cites and therefore the attribution — it is a wired-in stage, not an isolated score. `lexical` re-scores by question/label overlap (offline, deterministic); `llm` asks a model to pick the most relevant candidate (needs a key; fail-open — keeps first-stage order on any error) and adds its own cost/latency on top of retrieval.

**Chunking** (`chunks`). A **separate analysis, not a stage of the `run` diagnostic**: it chunks a long article and measures how much context a targeted passage saves versus feeding the whole article (offline, ~76% context reduction on the sample, right passage pinpointed). It is deliberately *not* wired into the pipeline, and this README says so rather than overselling "chunking wired in".

**Not done:** *fine-tuning* a legal-domain embedding model (the last item of the RAG mission) is a real training effort, out of scope for an honest deliverable, and is **not** implemented or simulated here — see DECISIONS.

## What it measures

| Metric | Failure it catches | Weight |
|---|---|---|
| `hallucinated_citation` | cites an article that doesn't exist in the corpus | 3 |
| `irrelevant_citation` | cites a real article that doesn't support the answer (judged) | 3 |
| `unsupported_claim` | gives an answer with no citation at all | 2 |
| `missed_authority` | omits the key article the question turns on | 2 |
| `missed_retrieval` | (RAG mode) the retriever never surfaced the key authority, recall failure | 3 |
| `agent_error` | the agent run threw, isolated per question, never aborts the run | 2 |

Hallucination and missing-authority are objective (corpus membership). Relevance is the judge's call, and the scorecard's **Judge calibration** section shows how often that judge agrees with the labelled gold set (and its false-positive / false-negative counts), so you know how much to trust the relevance verdicts.

### Judge calibration (who judges the judge?)

The gold set (`src/scenarios/judge_gold.ts`, 36 hand-labelled items) is authored **independently** of the corpus `keyAuthorities`: every `relevant` label is a legal judgement about whether the cited article supports *that specific answer*, not a copy of "is this the key authority". It deliberately includes hard cases where relevance and key-authority membership diverge — near-miss authorities that genuinely support the answer but are not the registered key article, and the correct key article cited under an answer it does *not* support. That decoupling is what stops the number from being self-fulfilling.

Any offline run reports the calibration of the deterministic no-key judge (`judge:static-keyauthorities`, which is answer-blind — it credits exactly the key authority per question). Against the independent gold it scores (deterministic, no key):

```
Judge calibration
  Judge: judge:static-keyauthorities
  Agreement rate: 64% (23/36)
  False positives: 6
  False negatives: 7
```

The 6 false positives (right article, wrong answer) and 7 false negatives (near-miss authorities) are structural: a judge keyed only on `(question, citation)` **cannot** get them right, because relevance depends on the answer. That gap — 64%, not ~100% — is the honest measure of how far a cheap answer-blind judge falls short of a judge that actually reads the answer. With an API key the same section instead reports the live LLM judge's agreement against the same gold.

**Real gpt-4o run, committed as evidence** (`docs/gpt4o-run.txt`, 2026-09-14, current 12-question / 36-item-gold corpus; non-deterministic run to run):

- `run --model gpt-4o` (no RAG, agent sees the full corpus): **100/100 (12/12)**, ~10.3k tokens, ~$0.034, ~2.6 s/question. The gpt-4o *judge* calibrates at **89% (32/36), 3 false positives, 1 false negative** — even a strong judge rubber-stamps three unsupported citations, which is exactly why the judge is measured, not trusted.
- `run --model gpt-4o --rag` (retrieve-then-cite, lexical baseline retriever): **86/100 (7/12)** — the retriever **misses the key authority on 5 of 12 questions** (`missed_retrieval` 42%), and on two of those the agent then answers with no citation at all (`unsupported_claim`). Same agent, worse score, because the RAG layer is now in the loop and the harness attributes the failure to *retrieval*, not to the model. That is the whole point of per-layer attribution.
- Retrieval recall with real `text-embedding-3-small` (n=1, non-deterministic): keyword **58%**, semantic **75%**, hybrid **75%**. Caveat above: that gap partly reflects a deliberate label-vs-gloss indexing asymmetry, not a clean semantic win, and `hybrid` matches `semantic` while regressing on two hard questions. Also note `--rag` defaults to the **keyword** retriever, so the 86/100 RAG score is the pessimistic (weakest-retriever) case by design; `--retriever semantic` lifts it.

## Why you can trust the harness (mutation proof)

`test/eval.test.ts` runs deliberately-broken agents (hallucinator, irrelevant-citer, unsupported) and asserts each is caught on the right metric, that a correct agent passes every question, and, crucially, that **calibration catches an unreliable judge**: a judge that calls everything relevant is flagged with false positives; the answer-blind static judge shows genuine false positives *and* false negatives against the decoupled gold (proving the agreement is not self-fulfilling); and an answer-aware oracle judge reaches perfect agreement (the ceiling the static judge structurally cannot). The same mutation-proof discipline covers retrieval: a broken retriever that never surfaces the key authority is caught by `missed_retrieval`, while an oracle retriever is not falsely flagged.

The LLM judge/agent paths are covered too, with **zero API credits**: the pure parsers (`parseVerdicts`, `parseAnswerCall`) are tested on valid and malformed JSON, and an injected fake client exercises the **fail-safe seam** — when the client throws, returns garbage, or skips a citation, the judge marks it `uncertain` (neither a fabricated agent failure nor a silent pass; calibration excludes it from the rate), and a throwing agent surfaces as `agent_error`, never a fabricated pass.

```bash
npm test
```

## Layout

```
src/
  types.ts            # shared contracts (incl. the Judge interface)
  corpus/             # public Code civil subset + normalization + retrieval
                      #   (keyword/semantic/hybrid), embeddings, rerank, chunking
  agent/              # legal agent (OpenAI / OpenRouter) + buggy agents
  judge/              # LLM-as-a-Judge + static judge + calibration
  scenarios/          # 12 questions (incl. 4 hard paraphrases) + 36-item independent gold
  eval/               # metrics, evaluator, scorecard, retrieval recall
  runner.ts · cli.ts · obs/langfuse.ts
test/                 # mutation-proof + calibration tests
```

## License

MIT
