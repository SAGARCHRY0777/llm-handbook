---
title: Ensembles, cascades & routing
slug: ensembles-and-routing
module: optimization
order: 37
status: live
level: intermediate → advanced
summary: Most traffic does not need your best model. Cascades, big-little pairs and learned routers exploit that — and the whole design turns on one number nobody measures first.
---

# Ensembles, cascades & routing

> **The one sentence:** send the easy queries somewhere cheap — the entire
> field is that idea, and the only hard part is deciding what "easy" means
> before you have the answer.

Every other page in this module makes *one* model cheaper. This one accepts the
model as given and asks a different question: **does this request need that
model at all?** On most production traffic the honest answer is no, and the gap
between a small model's cost and a frontier model's is large enough that
routing beats nearly everything else on this list.

It is also the cheapest thing here to get wrong, because a router that is
confident and mistaken does not degrade gracefully — it sends a hard query to a
model that cannot answer it and returns a fluent wrong answer at low cost.

---

## 1 · Diagram

```
  THREE SHAPES, AND THEY ARE NOT THE SAME THING

  ROUTING — decide BEFORE, on the query alone
    query -> [classifier] -> small model        cheap, one inference
                          \-> large model       risk: you guessed wrong
    cost  = router + one model
    needs : a way to predict difficulty from the question

  CASCADE — try cheap first, ESCALATE on low confidence
    query -> small model -> confident? -> answer
                          \-> not? -> large model -> answer
    cost  = small + (escalation rate x large)
    needs : a usable confidence signal. This is the whole problem.

  ENSEMBLE — ask SEVERAL, combine
    query -> model A ┐
          -> model B ┼-> vote / average -> answer
          -> model C ┘
    cost  = ALL of them. This buys accuracy, not savings.
    needs : genuine diversity, or you paid 3x for correlated errors


  THE NUMBER THAT DECIDES EVERYTHING

    cascade cost = small + (escalation_rate x large)

    at a 20x price ratio, cost relative to using the large model alone:

      escalate 10%  ->   3.0 vs 20.0    6.7x cheaper    clearly worth it
      escalate 50%  ->  11.0 vs 20.0    1.8x cheaper    thin for the effort
      escalate 95%  ->  20.0 vs 20.0    BREAK-EVEN      pointless
      escalate 99%  ->  20.8 vs 20.0    worse           actively harmful
```

The bottom block is the page, and it is more forgiving than intuition suggests:
the break-even is `(large - small) / large`, so at a 20x ratio you can escalate
**95%** of requests before a cascade costs more than not having one. The wasted
small-model call is only a twentieth of what you were going to spend anyway.

The trap is not the break-even, it is the middle of that table. **The savings
collapse long before the cascade becomes harmful** — and 1.8x is a poor return
for a router, a threshold, two models to operate and a new way to be wrong.

---

## 2 · Design

### Routing — decide up front

A classifier looks at the query and picks a model. Cheapest shape, because you
pay for exactly one inference plus a router that is usually tiny.

The difficulty is that you are predicting *answer* difficulty from the
*question*, and the two are only loosely related. "What is the capital of
France" and "What is the capital of the country with the third-largest GDP in
2019" look similar to an embedding model and are not similar at all.

What works in practice is narrower than a general difficulty classifier:

- **Task type**, which is often visible from the request path — a summarisation
  endpoint and a code-debugging endpoint do not need the same model, and you
  already know which is which.
- **Length and structure** — a request with a 40k-token document attached is
  retrieval-shaped, not reasoning-shaped.
- **Explicit user signal** — a "think harder" affordance moves the decision to
  the person who knows what they asked.

### Cascades — try cheap, escalate

Run the small model. If it is confident, return. If not, escalate. The appeal is
that you no longer predict difficulty — you *observe* the small model failing,
which is far more reliable than guessing in advance.

The catch is the word "confident". Options, in increasing order of honesty:

| Signal | How good it is |
|---|---|
| Token logprobs / sequence probability | Cheap, and weakly correlated with correctness. Models are confidently wrong. |
| A trained verifier over the answer | Better, and it is another model to serve and maintain |
| **Actually checking the answer** | Best by a wide margin, where it is possible |

That last row is the one to reach for first. If the answer is code, run the
tests. If it is arithmetic, evaluate it. If it is a claim about a document, check
the span exists. **Verification is cheap relative to generation and turns a
probabilistic escalation signal into a deterministic one** — and where you can
do it, the cascade stops being a gamble.

### Big-little pairs

The cascade's specific case, and the one with the best economics: a small model
and a large one *from the same family*, so they share a tokenizer and often a
prompt format. Same prompt, same tooling, no per-model adaptation. The small
model handles the bulk; the large one handles what escalates.

It pairs naturally with [speculative decoding](decoding.html), where a draft
model already exists — although note the two are doing different jobs. Speculative
decoding uses the small model's tokens and *verifies every one*; a cascade uses
the small model's whole answer and verifies none of them unless it escalates.
One is exact, the other is a quality trade.

### Ensembles — several models, combined

Ask multiple models, vote or average. This belongs on an optimisation page only
to say clearly: **it is not an optimisation.** It multiplies cost by the number
of members to buy accuracy and variance reduction.

The condition for it working at all is **diversity** — members that make
*different* mistakes. Three checkpoints from the same base fine-tuned on the same
data will agree confidently and wrongly together, and you will have paid 3× for
correlated errors. If you cannot articulate why your members fail differently,
you do not have an ensemble; you have an expensive single model.

Related shapes worth knowing by name: **committee** (fixed members vote),
**swarm** (many cheap members, aggregate), **consensus decoding** (agreement at
the token level rather than the answer level), and **collaborative inference**
(members with different roles rather than the same role).

---

## 3 · Flow

```
  1. Can you verify the answer cheaply?
     |    yes -> CASCADE with verification as the escalation signal.
     |           Best shape available. Stop looking.
     v    no
  2. Is task type visible from the request?
     |    yes -> ROUTE on it. You already know; do not learn it.
     v    no
  3. Do you have a usable confidence signal?
     |    yes -> CASCADE, and MEASURE THE ESCALATION RATE before
     |           committing. Above the break-even it costs more.
     v    no
  4. Is accuracy the goal, and is budget available?
     |    yes -> ENSEMBLE, if and only if the members fail differently.
     v    no
  5. Use one model. A router you cannot trust is worse than no router.
```

Step 1 first, always. Everything downstream is an attempt to approximate a
signal that step 1 gives you exactly.

---

## 4 · Example

```python
"""When does a cascade actually save money?

The break-even is the whole decision and it is one line of algebra. Compute it
before building anything -- a cascade above its break-even escalation rate is
strictly worse than using the large model directly.
"""


def cascade_cost(escalation_rate, small=1.0, large=20.0, verify=0.0):
    """Cost per request, in units of one small-model call.

    Every request pays the small model. Escalated ones pay the large model
    ON TOP -- the small-model call is not refunded.
    """
    return small + verify + escalation_rate * large


def break_even(small=1.0, large=20.0, verify=0.0):
    """Escalation rate above which the cascade costs more than large-only."""
    return (large - small - verify) / large


for ratio in (5, 20, 100):
    be = break_even(large=ratio)
    print(f"large/small = {ratio:>3}x   break-even escalation = {be*100:>5.1f}%")

print(f"\n{'escalation':<12}{'cascade':>10}{'vs large-only':>15}")
print("-" * 38)
for r in (0.05, 0.10, 0.25, 0.50, 0.80):
    c = cascade_cost(r)
    print(f"{r*100:>8.0f}%   {c:>9.2f}{20.0/c:>14.2f}x")

# A verifier is not free, and it runs on EVERY request.
print("\nwith a verifier at 0.5x small-model cost, run on every request:")
for r in (0.05, 0.10, 0.25):
    c = cascade_cost(r, verify=0.5)
    print(f"  escalation {r*100:>3.0f}%  ->  {c:>5.2f}   ({20.0/c:>4.2f}x vs large-only)")
```

```
large/small =   5x   break-even escalation =  80.0%
large/small =  20x   break-even escalation =  95.0%
large/small = 100x   break-even escalation =  99.0%

escalation     cascade  vs large-only
--------------------------------------
       5%        2.00         10.00x
      10%        3.00          6.67x
      25%        6.00          3.33x
      50%       11.00          1.82x
      80%       17.00          1.18x

with a verifier at 0.5x small-model cost, run on every request:
  escalation   5%  ->   2.50   (8.00x vs large-only)
  escalation  10%  ->   3.50   (5.71x vs large-only)
  escalation  25%  ->   6.50   (3.08x vs large-only)
```

The break-even is far more forgiving than intuition suggests — at a 20× price
ratio you can escalate **95%** of requests and still break even, because the
wasted small-model call is only 1/20th of the large one. That is the genuinely
encouraging result here, and it is the opposite of what most people guess.

But read the second table with it: **the savings collapse long before the
break-even.** At 50% escalation you are still "winning" at 1.8×, which is a poor
return for a system with a router, a confidence threshold, two models to
maintain and a new failure mode. The break-even tells you when a cascade is
catastrophic; the middle of the table tells you when it is merely not worth
building.

The verifier row is the part people forget: **it runs on every request, including
the ones that never escalate.** A verifier at half the small model's cost pushes
the 5% case from 10× to 8× — still excellent, but it is a real line item and it
belongs in the arithmetic rather than in the footnotes.

---

## 5 · Depth — the senior layer

**Measure the escalation rate on real traffic before you build anything.** It is
the only input that matters and it is knowable in advance: run the small model
over a sample of logged production requests, apply the confidence rule you intend
to use, and count. Teams routinely build the cascade first and discover the rate
afterwards, at which point the architecture is committed.

**A router's errors are silent and asymmetric.** Sending an easy query to the
large model costs money. Sending a hard query to the small model returns a wrong
answer that nobody flags, because it reads exactly like a right one. Those are
not comparable failures, and a router tuned to minimise average cost will make
the second kind freely. Tune the threshold on the *cost of being wrong*, not on
the cost of the inference.

**Verification beats confidence, and it is under-used.** Logprobs are a weak
proxy that fails hardest on exactly the confident-and-wrong cases you built the
cascade to catch. Running the tests, evaluating the arithmetic, checking the
cited span exists — these are deterministic, cheap relative to generation, and
turn escalation from a guess into a fact. If your task admits verification and
you are using logprobs instead, that is the first thing to change.

**Ensembles need diversity you can name.** "We run three models and vote" is only
an ensemble if the three fail differently. Same base, same fine-tuning data,
different seeds — that is one model with extra steps, and it will be confidently
wrong in unison. Before funding an ensemble, write down the mechanism by which
member B catches what member A misses. If you cannot, it does not exist.

**This composes with, and is often confused for, adaptive compute.** Routing by
difficulty across *models* and
[adaptive inference-time compute](reasoning-inference-optimization.html) within
one model attack the same waste from two sides, and they stack. What they share
is the finding that most traffic is easy; what differs is whether you respond by
changing the model or the thinking budget.

| Failure | Looks like | Actual cause |
|---|---|---|
| Cascade costs more than before | Bill up after a cost-reduction project | Escalation rate above break-even; small-model call is never refunded |
| Cascade saves money, quality drops | Cheaper and subtly worse | Threshold tuned on cost, not on the cost of being wrong |
| Escalation signal useless | Escalates randomly | Logprob confidence on a task where the model is confidently wrong |
| Ensemble no better than one model | 3× the cost, same accuracy | Correlated members — same base, same data |
| Router great offline, poor live | Benchmarks did not transfer | Difficulty predicted from the query; live traffic has a different mix |
| Verifier ate the savings | Modest gain, lots of machinery | It runs on every request, not only escalated ones |

---

## 6 · From each seat

| Seat | What routing means here |
|---|---|
| **User** | Most answers arrive faster and cost less. The risk they cannot see: a question that looked easy and was not may have been answered by the cheap model. |
| **Coder** | Verify before you escalate, wherever the task allows it. Logprob thresholds are the fallback, not the design. And log which model answered — you cannot debug what you cannot attribute. |
| **Tester** | Evaluate the *system*, not the members. A cascade's quality is the small model's quality on what it keeps, which is not its quality on the full distribution. Stratify by whether the request escalated. |
| **System designer** | Two models is two capacity plans, two sets of KV memory and a router on the critical path. The break-even calculation belongs in the design doc, with the measured escalation rate, not an assumed one. |
| **Architect** | Big-little from one family buys you a shared tokenizer and prompt format, which is worth more operationally than a slightly better small model from elsewhere. |
| **CEO** | This is usually the largest single cost lever available, because most traffic does not need the best model. It is also the one that trades cost for quality most directly, so the threshold is a business decision, not an engineering one. |
| **Market** | Vendor "routing" features are this, run by the vendor, with the threshold chosen by the party that bills you. Ask what the escalation rate is and who can see it. |

---

## 7 · Interview questions

**"When does a cascade cost more than just using the big model?"**
Above the break-even escalation rate, `(large - small) / large`. Every request
pays the small model whether or not it escalates, so the wasted calls accumulate.
At a 20× price ratio the break-even is 95%, which is generous — but the savings
collapse well before it: at 50% escalation you are only 1.8× better off, which is
a thin return for a router, a threshold, and a second model to operate.

**"What is the best escalation signal?"**
Verification, wherever the task allows it — run the tests, evaluate the
arithmetic, check the cited span exists. It is deterministic and cheap relative
to generation. Logprob confidence is the common fallback and it is weak, because
it fails hardest on confidently-wrong answers, which is the exact case the
cascade exists to catch.

**"Why might an ensemble of three models be no better than one?"**
Correlated errors. Ensembles buy variance reduction, which requires members that
fail *differently*. Three checkpoints from the same base on the same data agree
confidently and wrongly together, so you pay 3× for one model's judgement. The
test is whether you can state the mechanism by which one member catches what
another misses.

**"How is model routing different from adaptive inference-time compute?"**
Same observation, different lever. Both start from "most traffic is easy".
Routing changes *which model* answers; adaptive compute changes *how long* one
model thinks. They stack, because they attack different terms — and confusing
them leads to building a router when a reasoning-effort parameter would have
done.

---

## Stop condition

You are done when you can:

- State the cascade break-even formula and compute it from a price ratio
- Explain why savings collapse well before the break-even
- Rank escalation signals, and say why logprobs fail where it matters most
- Say what makes an ensemble real rather than three correlated models
- Distinguish routing from adaptive compute, and say why they stack
- Name the asymmetry in a router's two failure modes

---

## Sources worth reading

- **Cascades** — [*FrugalGPT*](https://arxiv.org/abs/2305.05176) (2023) — the cascade formulation and the cost arithmetic.
- **Verification over confidence** — [*Let's Verify Step by Step*](https://arxiv.org/abs/2305.20050) (2023) — process supervision, and why checking beats asking.
- **Self-consistency** — [Wang et al.](https://arxiv.org/abs/2203.11171) (2022) — ensembling one model's own samples, the cheapest form of diversity.

Related: [LLM APIs & model selection](model-selection.html) for choosing the
members · [Reasoning inference optimization](reasoning-inference-optimization.html)
for adaptive compute within one model · [Decoding](decoding.html) for speculative
decoding, the exact cousin of a cascade · [Regression gates](regression-gates.html)
for evaluating a system rather than a model.
