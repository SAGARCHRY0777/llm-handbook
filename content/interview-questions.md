---
title: Interview question bank
slug: interview-questions
module: practice
order: 81
status: live
level: reference
summary: Every question from the handbook in one place, grouped by round, with the ones that most often separate candidates marked.
---

# Interview question bank

Every question from across the handbook, consolidated. Each links back to the
page that answers it properly.

⭐ marks the questions that most reliably separate candidates — usually because
the obvious answer is wrong, or because most people stop one level short.

---

## How to drill this

Do not read the answers. Cover them, answer out loud, then check.

The failure mode of a question bank is recognition without recall: you read the
answer, it feels familiar, you conclude you know it, and then you cannot produce
it under pressure. **Say it out loud** — the gap between "I know this" and "I can
say this in sixty seconds" is where interviews are lost.

Time-box to **two minutes per question**. Most answers should take sixty to
ninety seconds. If you cannot finish in two minutes you are including material
that is not earning its place.

---

```sim
mockround
```

---

## Round 1 · Foundations

*Asked to check you understand the machine, not just the API.*

| Question | Page |
|---|---|
| Explain attention. | [Transformers](transformers.md) |
| ⭐ Why is decode memory-bound but prefill compute-bound? | [Transformers](transformers.md) |
| What is the KV cache and why does it matter? | [Transformers](transformers.md) |
| Why decoder-only for generation? | [Transformers](transformers.md) |
| What does FlashAttention change? | [Transformers](transformers.md) |
| ⭐ Why can't the model count the letters in a word? | [Tokenization](tokenization.md) |
| Why is non-English text more expensive? | [Tokenization](tokenization.md) |
| Temperature 0 versus 0.7 — when each? | [Decoding](decoding.md) |
| ⭐ Is temperature 0 deterministic? | [Decoding](decoding.md) |
| top_k or top_p, and why? | [Decoding](decoding.md) |
| Why don't chat models use beam search? | [Decoding](decoding.md) |
| What is speculative decoding? | [Decoding](decoding.md) |

---

## Round 2 · RAG and retrieval

*The largest section, because it is the most-asked area.*

| Question | Page |
|---|---|
| How would you chunk a technical manual? | [Chunking](chunking.md) |
| ⭐ RAG quality is poor. Where do you look first? | [Chunking](chunking.md) |
| What is small-to-big retrieval? | [Chunking](chunking.md) |
| ⭐ How do you handle permissions in RAG? | [Chunking](chunking.md) |
| You are changing embedding model. What is involved? | [Chunking](chunking.md) |
| How does HNSW work? | [Embeddings & vector DBs](embeddings-and-vector-databases.md) |
| ⭐ What recall does your ANN index actually get? | [Embeddings & vector DBs](embeddings-and-vector-databases.md) |
| Is 0.82 cosine similarity good? | [Embeddings & vector DBs](embeddings-and-vector-databases.md) |
| Which vector database, and why? | [Embeddings & vector DBs](embeddings-and-vector-databases.md) |
| ⭐ Why two retrieval stages instead of one? | [Reranking](reranking.md) |
| How deep should the shortlist be? | [Reranking](reranking.md) |
| When does a reranker *not* help? | [Reranking](reranking.md) |
| ⭐ What is HyDE and why does it work? | [Query transformation](query-transformation.md) |
| HyDE hallucinates. Isn't that a problem? | [Query transformation](query-transformation.md) |
| Multi-query or reranking — which fixes what? | [Query transformation](query-transformation.md) |
| How do you fuse results from several queries? | [Query transformation](query-transformation.md) |
| How do you stop RAG answering from irrelevant context? | [Corrective RAG](corrective-rag.md) |
| CRAG versus self-RAG? | [Corrective RAG](corrective-rag.md) |
| ⭐ Your relevance grader is sometimes wrong. Is that a problem? | [Corrective RAG](corrective-rag.md) |

---

## Round 3 · Evaluation

*Where most candidates are weakest, and where a good answer is most noticeable.*

| Question | Page |
|---|---|
| ⭐ How do you know your LLM judge is any good? | [LLM as a judge](llm-as-a-judge.md) |
| Pointwise or pairwise judging? | [LLM as a judge](llm-as-a-judge.md) |
| ⭐ The score went up 4 points on 50 items. Ship it? | [LLM as a judge](llm-as-a-judge.md) |
| The vendor updated the judge model. What now? | [LLM as a judge](llm-as-a-judge.md) |
| When would you *not* use an LLM judge? | [LLM as a judge](llm-as-a-judge.md) |
| How do you stop LLM quality regressing? | [Regression gates](regression-gates.md) |
| ⭐ Why gate per bucket as well as overall? | [Regression gates](regression-gates.md) |
| Should a green run update the baseline? | [Regression gates](regression-gates.md) |
| Someone edited the corpus. What should the gate do? | [Regression gates](regression-gates.md) |
| How do you know your gate works? | [Regression gates](regression-gates.md) |
| How would you detect drift in a live system? | [Drift detection](drift-detection.md) |
| Covariate versus concept drift? | [Drift detection](drift-detection.md) |
| ⭐ You have no labels. How do you monitor quality? | [Drift detection](drift-detection.md) |
| ⭐ Drift detected. Do you retrain? | [Drift detection](drift-detection.md) |
| In predictive maintenance, how do you know an alert was right? | [Drift detection](drift-detection.md) |
| How would you check an LLM system for bias? | [Bias & explainability](bias-and-explainability.md) |
| ⭐ Can you make it fair? | [Bias & explainability](bias-and-explainability.md) |
| ⭐ Is chain-of-thought an explanation? | [Bias & explainability](bias-and-explainability.md) |
| A segment has 40 samples and looks bad. | [Bias & explainability](bias-and-explainability.md) |

---

## Round 4 · Systems, serving and optimization

| Question | Page |
|---|---|
| ⭐ Why does quantization make inference faster? | [Quantization](quantization.md) |
| INT8 or INT4? | [Quantization](quantization.md) |
| ⭐ What breaks first when you quantize? | [Quantization](quantization.md) |
| Why do large models quantize worse than small ones? | [Quantization](quantization.md) |
| You got 1.2× not 4×. Why? | [Quantization](quantization.md) |
| Quantization, pruning or distillation — which first? | [Distillation & pruning](distillation-and-pruning.md) |
| ⭐ You pruned to 90% sparsity and it is not faster. | [Distillation & pruning](distillation-and-pruning.md) |
| Why do soft labels beat hard labels? | [Distillation & pruning](distillation-and-pruning.md) |
| What is the risk in distilling from a commercial API? | [Distillation & pruning](distillation-and-pruning.md) |
| What is continuous batching? | [Serving](serving-and-operations.md) |
| ⭐ Your p95 latency doubled. Debug it. | [Serving](serving-and-operations.md) |
| ⭐ How do you handle overload? | [Serving](serving-and-operations.md) |
| How would you cut the bill in half? | [Serving](serving-and-operations.md) |
| Why is `max_tokens` a capacity control? | [Serving](serving-and-operations.md) |

---

## Round 5 · Agents, safety and adaptation

| Question | Page |
|---|---|
| What is an agent? | [Agents](agents.md) |
| ⭐ Why do long agent chains fail? | [Agents](agents.md) |
| How do you stop an agent running forever? | [Agents](agents.md) |
| ⭐ How do you design tools? | [Agents](agents.md) |
| When is multi-agent worth it? | [Agents](agents.md) |
| How would you evaluate an agent? | [Agents](agents.md) |
| ⭐ How do you prevent prompt injection? | [Guardrails](guardrails-and-security.md) |
| Direct versus indirect injection? | [Guardrails](guardrails-and-security.md) |
| Where do you enforce permissions? | [Guardrails](guardrails-and-security.md) |
| What is the dual-LLM pattern? | [Guardrails](guardrails-and-security.md) |
| ⭐ RAG or fine-tuning? | [Fine-tuning](fine-tuning.md) |
| What is LoRA, mechanically? | [Fine-tuning](fine-tuning.md) |
| How much training data? | [Fine-tuning](fine-tuning.md) |
| ⭐ When would you *not* fine-tune? | [Fine-tuning](fine-tuning.md) |
| What actually improves a prompt? | [Prompt engineering](prompt-engineering.md) |
| How do you get reliable JSON? | [Prompt engineering](prompt-engineering.md) |
| You have changed the prompt 15 times and it still fails. | [Prompt engineering](prompt-engineering.md) |

---

## Round 6 · Judgement, product and business

*Asked at senior level, and where technical candidates most often stumble.*

| Question | Page |
|---|---|
| ⭐ How would you choose a model? | [Model selection](model-selection.md) |
| Hosted or self-hosted? | [Model selection](model-selection.md) |
| What licence questions matter? | [Model selection](model-selection.md) |
| Your context window is 200k. Use it? | [Model selection](model-selection.md) |
| LangChain or LlamaIndex? | [Orchestration](orchestration-frameworks.md) |
| What is DSPy actually doing? | [Orchestration](orchestration-frameworks.md) |
| ⭐ Would you use a framework at all? | [Orchestration](orchestration-frameworks.md) |
| ⭐ Should we build or buy? | [Market & business](market-and-business.md) |
| How would you price this? | [Market & business](market-and-business.md) |
| ⭐ What is our moat? | [Market & business](market-and-business.md) |
| The demo works. Why isn't it shipped? | [Market & business](market-and-business.md) |
| ⭐ When should we *not* use an LLM? | [Market & business](market-and-business.md) |

---

## The twelve that matter most

If you have one evening, drill these. They cover the widest ground and each has
a counter-intuitive core that most candidates miss.

1. **Why does quantization make inference faster?** — bandwidth, not arithmetic
2. **The score went up 4 points on 50 items. Ship it?** — no; ±11 point interval
3. **How do you know your judge is any good?** — kappa against human labels
4. **How do you prevent prompt injection?** — you don't; you bound the blast radius
5. **Why do long agent chains fail?** — reliability compounds multiplicatively
6. **RAG or fine-tuning?** — knowledge versus behaviour
7. **RAG quality is poor. Where first?** — the retrieval ceiling
8. **Is chain-of-thought an explanation?** — no, and saying why is the signal
9. **You pruned to 90% and it's not faster.** — unstructured sparsity does nothing
10. **Can you make it fair?** — not in all senses at once; it's a proven result
11. **What's our moat?** — not the prompt, model or pipeline
12. **When should we not use an LLM?** — when a deterministic solution exists

---

## Answering well, mechanically

**Lead with the answer, then justify.** "No — at n=50 the interval is ±11 points"
beats three sentences of preamble arriving at the same place.

**Name the trade-off.** Almost every question here has one. Naming it
unprompted is most of what "senior" sounds like.

**Say what you would measure.** The strongest ending to any answer is how you
would know you were right.

**Admit the limit.** "I would need to check the current pricing" is stronger
than a confident wrong number. Interviewers are calibrating whether they can
trust what you say — a single fabricated detail costs more than the answer gains.

**Use your own work.** You have an eval harness with a golden set, a gate, and a
failure-injection test you watched go red. Nearly every question in Rounds 3 and
4 can be answered with "here is what I actually did" — which beats any
theoretical answer available to anyone else in the pipeline.
