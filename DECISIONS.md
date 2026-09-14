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

**Doesn't prove.** The gold set is 19 hand-labelled items — a floor that proves
the calibration harness runs and can catch a bad judge, not a production-grade
judge-quality figure. A real deployment needs a much larger, adversarial,
lawyer-labelled set. (Committed real run: the gpt-4o judge calibrates at 89%,
17/19, 2 false positives — even a strong judge is not trustworthy unmeasured.)

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
the repo, and it is why the answer-blind judge scores only **74% (14/19)** once
the gold is decoupled from its `keyAuthorities` signal. I would rather ship a
74% I can defend than a ~100% that is an artefact of grading a judge against its
own key. (The circular gold that would produce the ~100% is deliberately *not*
committed; the point is precisely that such a number is meaningless.)

**Doesn't prove.** 74% is on 19 hand-labelled items, and the divergent cases are
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
authorities); the meaningful judge is the LLM one, whose 74% (decision 3) is the
number that matters.
