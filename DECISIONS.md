# Decisions

Why this instrument is shaped the way it is. Each entry is a fork I actually
hit, the options I weighed, what I chose, and what the choice still does **not**
prove. The code is the *what*; this is the *why*. For a citation-reliability
tool the judgement is the product, so this file is the product too.

---

## 1. Objective failures are checked against the corpus, never asked of the model

**Fork.** To decide whether a citation is hallucinated or a key authority is
missing, I could ask an LLM "is this citation real / complete?", or check the
cited article numbers against the actual corpus.

**Chosen.** The corpus. `hallucinated_citation` = the cited article number is
not in the public corpus; `missed_authority` = the question's expected key
article is absent from the answer's citations. Both are set membership over
`corpus.ts`, computed in `eval/metrics.ts`, not a model opinion.

**Why.** Hallucination is the exact failure a legal tool cannot afford, and it
is objectively decidable (an article number either exists or it doesn't).
Delegating a decidable fact to an LLM would add noise and a second thing to
trust. Only *relevance* — does this real article actually support the answer? —
genuinely needs judgement, so only that is judged (decision 2).

**Doesn't prove.** Corpus membership proves the article exists, not that the
answer's legal reasoning is correct. Citing a real, on-topic article under a
wrong conclusion is caught only by the relevance judge, which is fallible.

---

## 2. Relevance is judged by an LLM — and the judge's own reliability is measured

**Fork.** `irrelevant_citation` / `unsupported_claim` need a relevance call.
Trust an LLM-as-a-Judge, or measure the judge before trusting it.

**Chosen.** Measure it. `judge/calibration.ts` runs the judge over a hand-
labelled gold set (`scenarios/judge_gold.ts`) and reports agreement, false
positives and false negatives. The scorecard prints a "Judge calibration"
section next to the score.

**Why.** Everyone can wire an LLM-as-a-Judge; the mission asks for *robust*
evaluation methodology. A judge whose error rate you have not measured is not a
metric, it is an opinion. Anyone can print a reliability score; the first
question about that score is who produced it and how often it is wrong.

**Doesn't prove.** The gold set is 36 hand-labelled items — a floor that proves
the calibration harness runs and can catch a bad judge, not a production-grade
judge-quality figure. A real deployment needs a much larger, adversarial,
lawyer-labelled set. (Committed real run on the current 36-item gold: the gpt-4o
judge calibrates at 89%, 32/36, 3 false positives — even a strong judge is not
trustworthy unmeasured.)

---

## 3. The calibration gold set is authored INDEPENDENTLY of the judge's signal (the de-circularization)

**Fork.** The easy gold set labels `relevant = (article is a keyAuthority)`.
The offline demo judge keys relevance on exactly those `keyAuthorities`.

**Chosen.** Break the loop. Every `relevant` label in `judge_gold.ts` is hand-
authored from legal reasoning about whether the article supports *this answer*,
deliberately including cases where that diverges from `keyAuthorities`: near-
miss articles that do support the answer but are not the registered key one
(an answer-blind judge marks them a false negative), and the correct key
article cited under an answer it does not actually support (a false positive an
answer-blind judge cannot catch).

**Why.** If the gold set relabelled the judge's own signal, calibration would be
circular: the judge is graded against itself and scores **~100% by construction**
— a number that measures nothing. This is the single most important decision in
the repo, and it is why the answer-blind judge scores only **64% (23/36)** once
the gold is decoupled from its `keyAuthorities` signal. I would rather ship a
64% I can defend than a ~100% that is an artefact of grading a judge against its
own key. (The circular gold that would produce the ~100% is deliberately *not*
committed; the point is precisely that such a number is meaningless.)

**Doesn't prove.** 64% is on 36 hand-labelled items, and the divergent cases are
placed by hand — it bounds the demo judge's answer-blindness, it is not a stable
population estimate.

---

## 4. "Agent" is an honest label for a one-shot verifier, not a claim of autonomy

**Fork.** Call the thing under test an "agent" (the buzzword the market rewards)
or describe exactly what it is.

**Chosen.** Describe it. The README's "On the word agent" note states plainly:
the real-model path is a single `chat.completions.create` call with one
`answer_question` tool, no planning, memory or multi-step loop (in `--rag` mode
a lexical retriever runs once first). The `buggy:*` fixtures are plain, network-
free functions.

**Why.** For a company whose bar is "the devil in the details", overclaiming
autonomy is the fastest way to lose a technical reader who reads the code. The
harness's value does not depend on the answerer being agentic — it grades the
answer and citations returned, so a genuinely agentic answerer drops in
unchanged. Saying so costs nothing and buys trust.

**Doesn't prove.** It does not exercise multi-step tool loops or memory, so it
says nothing about failure modes that only appear in a real agent.

---

## 5. Mutation proof includes a test that catches a deliberately complaisant judge

**Fork.** Prove the harness works by testing the happy path, or by injecting
faults — including into the judge itself.

**Chosen.** Fault injection. `buggy.ts` gives a hallucinator, an irrelevant-
citer, an unsupported-answerer and a perfect agent; each buggy one must be
caught on its metric and the perfect one must pass clean. Crucially there is
also a test that a judge which rubber-stamps everything "relevant" is caught by
its false-positive rate in calibration.

**Why.** The whole thesis is "measure the measurer". A calibration harness that
could not flag a bad judge would be the same blind trust it exists to remove, so
that test is the keystone, not an extra.

**Doesn't prove.** These are constructed fixtures, not mutation testing of the
diagnostic source itself; they show the instrument catches known faults, not
that it resists every mutation of its own code.

---

## 6. A missing judge verdict is UNCERTAIN — fail-safe, not fail-open

**Fork.** When the judge returns no verdict for a citation (API error, malformed
output, or a citation it simply skipped), treat it as relevant (fail-open),
irrelevant (fail-closed), or a third "unknown" state.

**Chosen.** The third state. An unverified citation is `{ relevant: false,
uncertain: true }`: it fires no failure metric (never fabricates an agent
error), it is not a verified pass, and `calibrateJudge` excludes it from the
agreement-rate denominator (`agree / (total - uncertain)`). `judge.ts` and
`calibration.ts` agree on this, and it is tested (a throwing / malformed /
partial-verdict client → uncertain, not relevant; a fully-uncertain judge →
0 fabricated false positives).

**Why.** This started as fail-OPEN — a silent judge outage read as "citation is
fine", the single most mission-contrary default for a legal-reliability tool.
Worse, in calibration a fail-open default on a gold-*false* item fabricated a
false positive indistinguishable from a genuinely complaisant verdict, so the
outage silently polluted the headline number. The `UNCERTAIN` state (borrowed
from a sibling RAG-reliability project) removes both: an unverified item can no
longer masquerade as a pass or as a fault. I flagged this as the #1 thing to fix
and fixed it rather than ship the version I'd already called inferior.

**Doesn't prove.** A high uncertain count means the judge is flaky, not that the
agent is good — a run must be read with its uncertain count in view, not just
its agreement rate.

---

## 7. Offline by default, real model behind one env var

**Fork.** Require an API key to run anything, or run fully offline with a
deterministic static judge and light up the LLM path only when a key is present.

**Chosen.** Offline by default (`buggy:*` agents + a deterministic static judge,
zero network); `OPENAI_API_KEY` swaps in the real LLM answerer and LLM judge and
adds real scorecard + calibration + cost/latency numbers.

**Why.** A reviewer must see the whole thesis in two minutes, deterministically,
no credits. And the static judge is what makes the offline mutation tests
deterministic.

**Doesn't prove.** The offline static judge is trivial (keyed on question
authorities); its 64% (decision 3) bounds only its own answer-blindness, and the
meaningful judge is the LLM one, whose calibration against the same 36-item gold
is the number that matters: gpt-4o at 89% (32/36), 3 FP, 1 FN (see decision 2).

---

## 8. Semantic + hybrid retrieval behind one interface; embeddings offline by default

**Fork.** The retrieval dimension could stay a single lexical baseline, or grow
a real embedding/hybrid stack. If it grows, embeddings could require a key
(nothing runs offline) or fall back deterministically.

**Chosen.** Three retrievers — `keyword` (lexical over the label), `semantic`
(embeddings + cosine over label+gloss), `hybrid` (reciprocal-rank fusion of the
two) — behind one `Retriever` interface, all passing through the SAME
`missed_retrieval` diagnostic. Embeddings use the real OpenAI endpoint behind
`OPENAI_API_KEY` and a deterministic offline hashed-bag-of-words embedder
otherwise. RRF is rank-based, so it fuses the heterogeneous lexical and semantic
rankings with no score normalization.

**Why.** This covers the RAG mission's retrieval-depth items (hybrid + ranking)
while keeping the whole thing runnable and testable with zero credits and zero
network. Because every retriever goes through the same metric, this is
retriever-agnostic measurement, not a demo of one clever retriever — swap in a
vector DB behind the interface and the diagnostic is unchanged.

**Doesn't prove.** Offline the hashed bag-of-words embedder is essentially
lexical, so "semantic" largely replays token overlap and "hybrid" ties it rather
than beating it; the discriminating power comes from WHAT each path indexes (the
embedder reads the fuller gloss), not from learned meaning. Real embeddings are
needed for a real semantic signal.

---

## 9. The reranker is a WIRED-IN stage that changes the citation, not an isolated score

**Fork.** A reranker could be a standalone function you call and print, or a
stage actually inserted into the pipeline so it changes what the agent cites.

**Chosen.** Wired in. `--reranker` reorders the retrieved shortlist BEFORE the
agent sees it; since the agent cites from the shortlist it is shown, reordering
changes which article it cites and therefore the downstream attribution. The
test proves the EFFECT (the citation flips from a distractor to the on-point
article, and both `irrelevant_citation` and `missed_authority` clear), not just
that a list got reordered. `lexicalReranker` is offline; `llmReranker` has an
injectable client seam so its path is exercised at 0 credits, and it is
fail-open (any error keeps the first-stage order).

**Why.** A reranker that grades nothing is theatre. The value is showing that a
precision stage can rescue a shortlist whose rank 1 is a wordy distractor — and
the only honest way to show it is to let it move the citation and watch the
attribution follow.

**Doesn't prove.** The LLM reranker adds a model call's cost and latency on top
of retrieval (the trade this stage makes), and the offline lexical reranker is a
crude title-overlap signal, not a cross-encoder.

---

## 10. Chunking is a SEPARATE analysis, not a stage of the diagnostic

**Fork.** Chunking (retrieval granularity on a long article) could be wired into
the `run` pipeline and sold as "chunking supported", or kept as a standalone
analysis that measures context reduction.

**Chosen.** A standalone `chunks` analysis that measures how much context a
targeted passage saves versus the whole article (~76% on the sample), explicitly
declared in the README as NOT a stage of the run diagnostic.

**Why.** The corpus is article-level, so wiring chunking into the pipeline would
be a fake stage that changes nothing downstream. Overselling "chunking wired in"
is exactly the kind of detail a technical reader checks and loses trust over.
Measuring it honestly as an analysis covers the mission item without the lie.

**Doesn't prove.** It measures context reduction on one synthetic long article;
it says nothing about end-to-end answer quality with chunked retrieval, which
would need the pipeline actually rebuilt around passages.

---

## 11. The corpus is engineered to BREAK recall saturation — and fine-tuning is declared NOT done

**Fork.** Leave the toy corpus (lexical already finds everything, so no retriever
can distinguish itself), or engineer it to discriminate: add real neighbouring
articles as semantic distractors and hard paraphrased questions whose vocabulary
misses the key article's label.

**Chosen.** Engineer it. Ten more real post-2016 Code civil articles act as
distractors / hard-question keys; four hard paraphrased questions are worded so
the lexical baseline scores the key article 0 (recall drops to 58%, 7/12), while
the key article's gloss lets the embedding path recover all four (67%, 8/12).
That measurable delta is what makes the retrieval work demonstrable rather than
saturated. Separately, **fine-tuning a legal-domain embedding model** (the RAG
mission's last item) is a real training effort, out of scope for an honest
deliverable, and is explicitly NOT implemented or simulated.

**Why.** The sharpest critique of the toy version was "recall is saturated, so
nothing you built for retrieval can be shown to work". Fabricating a corpus that
discriminates answers that critique directly and honestly (it is still
synthetic, but it now separates). And declaring fine-tuning undone beats faking
it: a reader who greps for training code and finds none, after a claim, is lost.

**Doesn't prove.** The corpus is still synthetic and hand-built to discriminate;
it shows the instrument can attribute a real retrieval fault, not that these are
production recall numbers. And the gold remains labelled by a non-lawyer — the
structural ceiling of decisions 2–3 is unchanged; a lawyer-validated set would
come from a real engagement, not from more of my own labels.
