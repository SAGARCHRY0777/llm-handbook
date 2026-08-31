---
title: Glossary
slug: glossary
module: reference
order: 90
status: live
level: reference
summary: Every term in the handbook, defined in one line, with the thing about it that actually matters.
---

# Glossary

Definitions are one line. The second line is the part that matters — the
consequence, the trap, or the reason the term exists. Terms are grouped by where
they belong rather than alphabetically, because that is how they are used.

Use the search box (press <kbd>/</kbd>) to jump to a term.

---

## Architecture & model internals

| Term | Definition | What matters about it |
|---|---|---|
| **Transformer** | Neural architecture built on self-attention | Two costs in different places: attention is quadratic in context, the MLP holds most of the weights |
| **Self-attention** | Each token attends to every other, weighted by relevance | The `softmax(QKᵀ/√d)V` step; the `√d` stops the softmax saturating |
| **Query / Key / Value** | The three projections attention computes from each token | Query is what a token seeks, key what it offers, value what it contributes |
| **Multi-head attention** | Several attention operations in parallel with different projections | Heads specialise; many contribute almost nothing, which is what makes pruning possible |
| **KV cache** | Stored keys and values for previous tokens | Grows linearly with context *and* batch; at long context it exceeds the model weights |
| **GQA** (grouped-query attention) | Several query heads share one key/value head | Shrinks the KV cache several-fold with little quality loss; now standard |
| **MQA** (multi-query attention) | All query heads share one KV head | GQA's more aggressive predecessor; more saving, more quality cost |
| **FlashAttention** | IO-aware attention implementation | Changes memory access, not mathematics — identical output, much faster |
| **RoPE** | Rotary position embedding | Encodes *relative* position; why context windows can be extended after training |
| **ALiBi** | Linear attention bias by distance | Alternative position scheme that extrapolates cheaply |
| **MoE** (mixture of experts) | Route each token to a few expert MLPs | Total parameters grow while per-token compute stays flat |
| **Decoder-only** | Causal attention; each token sees only what precedes it | Won because training parallelises over every position, not for representational reasons |
| **Encoder-only** | Bidirectional attention | Embeddings, classification, rerankers — BERT-family |
| **Logits** | Raw pre-softmax scores over the vocabulary | What the model actually outputs; decoding turns them into a token |
| **Prefill** | Processing the whole prompt at once | Compute-bound; sets time-to-first-token |
| **Decode** | Generating one token at a time | Memory-bandwidth-bound; why quantization speeds it up |

---

## Tokenization

| Term | Definition | What matters about it |
|---|---|---|
| **Token** | A subword unit; the model's atomic input | The model never sees characters, which is why it cannot count letters |
| **BPE** | Byte-pair encoding; merges frequent adjacent pairs | Frequency-derived, so English fragments least and other scripts most |
| **Vocabulary** | The fixed set of tokens, typically 32k–200k | Coupled to the model; counting with the wrong tokenizer gives wrong estimates |
| **Special tokens** | BOS, EOS, chat role markers | Consume budget and are easy to forget when counting |
| **Glitch token** | A vocabulary entry barely present in training | Its embedding is essentially arbitrary; behaviour on it is undefined, not just poor |
| **Context window** | Maximum tokens the model accepts | Advertised length exceeds usable length; recall degrades before the limit, worst in the middle |

---

## Decoding

| Term | Definition | What matters about it |
|---|---|---|
| **Temperature** | Divides logits before softmax | 0 for extraction and judging, ~0.7 for chat. 0 is not determinism |
| **Top-k** | Keep the k highest-probability tokens | Fixed regardless of confidence — wrong in both directions |
| **Top-p / nucleus** | Keep the smallest set reaching probability mass p | Adapts to confidence; the one to use |
| **Greedy decoding** | Always take the highest-probability token | Repetitive; the temperature-0 case |
| **Beam search** | Keep b best partial sequences | Wins for translation, loses for chat — likely text is bland text |
| **Frequency / presence penalty** | Down-weight tokens already used | Blunt: harmful on code, where repetition is correct |
| **Speculative decoding** | Draft model proposes, large model verifies | 2–3× faster with mathematically identical output, so no re-evaluation needed |
| **Constrained decoding** | A grammar masks invalid tokens | Makes schema violation impossible, not merely unlikely |
| **Logprobs** | Per-token log-probabilities | A free, uncalibrated confidence signal — good for routing, not for showing users |

---

## Retrieval & RAG

| Term | Definition | What matters about it |
|---|---|---|
| **RAG** | Retrieve documents, put them in context, generate | Fixes knowledge and freshness; does not fix behaviour |
| **Chunk** | A retrievable piece of a document | Retrieval can only return a chunk, so a chunk without the answer is a hard ceiling |
| **Overlap** | Repeating tokens across chunk boundaries | Buys boundary safety at permanent storage cost of `C/(C−O)` |
| **Small-to-big** | Retrieve on small chunks, send the parent section | Small embeds precisely, large answers well; decoupling gets both |
| **Embedding** | Vector representation where similar text is nearby | Cosine scores have no absolute meaning — rank with them, do not threshold blindly |
| **Bi-encoder** | Encodes query and document separately | Precomputable, scales to millions, cannot model interaction |
| **Cross-encoder** | Encodes query and document together | Far more accurate, one model pass per pair, unusable over a corpus |
| **Late interaction / ColBERT** | Vector per token, scored by MaxSim | Between the two: precomputable docs, token-level precision, large storage |
| **ANN** | Approximate nearest-neighbour search | *Approximate* — measure recall against an exact index or you have an unknown ceiling |
| **HNSW** | Layered navigable small-world graph index | `ef_search` is the live recall/latency dial; `M` costs memory |
| **IVF / PQ** | Cluster-based index / compressed vectors | For very large sets; PQ trades noticeable recall for memory |
| **Hybrid retrieval** | BM25 plus dense, fused | Each fails where the other succeeds |
| **BM25** | Classic lexical ranking function | Exact terms, names, codes — where embeddings are weakest |
| **RRF** | Reciprocal rank fusion, `1/(k+rank)` summed | Fuses by rank because scores from different systems are not comparable |
| **Reranking** | Reordering a shortlist with a stronger model | Optimises precision; retrieval optimises recall. Different objectives |
| **HyDE** | Embed a hypothetical answer instead of the question | Works *because* the fake answer may be wrong — it is a probe, never shown |
| **Query transformation** | Rewriting the query before retrieving | Fixes question/answer asymmetry; route it, do not apply it to everything |
| **Corrective RAG** | Grade retrieved passages, act if none are relevant | Adds the branch plain RAG lacks: the ability to decline |
| **Self-RAG** | Also grades its own output | Catches drift beyond good context, a different failure from bad retrieval |
| **Retrieval ceiling** | Fraction of answers present in any chunk | The hard upper bound on the whole pipeline; measure it first |

---

## Evaluation

| Term | Definition | What matters about it |
|---|---|---|
| **Golden set** | Frozen, versioned inputs with references | Freeze it, or today's score is not comparable to yesterday's |
| **Baseline** | The last accepted scores, committed | A score with nothing to compare against is a vanity number |
| **Gate** | The rule that fails the build | Ungated evals are ignored within about three weeks |
| **hit@k** | Any relevant chunk in the top k | Coarse; says nothing about ranking |
| **recall@k** | Fraction of relevant chunks retrieved | Differs from hit@k only for multi-chunk answers |
| **MRR** | Mean reciprocal rank of the first relevant result | Rank-sensitive; catches improvements hit@k cannot see |
| **nDCG** | Discounted cumulative gain, normalised | For graded relevance rather than binary |
| **Groundedness** | Whether the answer is supported by the context | For retrieval-only systems, asked one step earlier: is the answer there at all |
| **LLM-as-judge** | Using a model to score outputs | Unvalidated, it is a number with a decimal point — measure agreement with humans |
| **Cohen's kappa** | Agreement corrected for chance | Below 0.4 the judge is noise; raw agreement flatters imbalanced sets |
| **Position bias** | Judges prefer whichever answer came first | Swap the order and require both to agree |
| **Verbosity bias** | Judges reward longer answers | Report length alongside score |
| **Wilson interval** | Confidence interval for a proportion | At n=50, ±8–11 points — which is why a 4-point move is not evidence |
| **McNemar / paired comparison** | Compare per-item outcomes on the same items | Cancels shared variance; the right way to compare two runs |
| **Drift** | The world moves while the model does not | Four kinds — inputs, rule, corpus, vendor — with four different remedies |
| **Covariate drift** | P(X) changes | Inputs look different; the model may still be right |
| **Concept drift** | P(Y\|X) changes | Same input, different correct answer — the model is now wrong |
| **PSI** | Population stability index | Conventional bands (0.1 / 0.25) are folklore with a useful shape |
| **Disaggregation** | Computing metrics per segment | An aggregate is an average over people and hides who it fails |

---

## Optimization & serving

| Term | Definition | What matters about it |
|---|---|---|
| **Quantization** | Storing weights in fewer bits | Speeds up decode because it is bandwidth-bound; the arithmetic is unchanged |
| **PTQ / QAT** | Post-training / quantization-aware training | PTQ takes minutes and is right for almost everyone |
| **GPTQ / AWQ** | Second-order and activation-aware 4-bit methods | Both are responses to emergent outlier features |
| **Outlier features** | Activation dimensions 10–100× larger, above ~6.7B | Why naive INT8 activation quantization destroys large models |
| **Distillation** | Training a small student to imitate a large teacher | Soft labels carry "dark knowledge"; most teams actually do synthetic data generation |
| **Pruning** | Removing weights | Unstructured gives **no speedup** without sparse kernels |
| **Structured / 2:4 sparsity** | Removing whole units / 2 of every 4 weights | The forms that actually make inference faster |
| **Continuous batching** | Scheduling at each token step | A finished sequence leaves immediately; several times static batching's throughput |
| **PagedAttention** | KV cache paged like virtual memory | Cuts waste, enabling much larger batches in the same VRAM |
| **TTFT** | Time to first token | What users judge; set by prompt length and queueing |
| **TPOT** | Time per output token | Set by bandwidth and batch size; a different problem from TTFT |
| **Prefix caching** | Reusing computation for a shared prompt prefix | Often the largest single cost lever on a stable system prompt |
| **Load shedding** | Rejecting work above a threshold | Needs hysteresis — two thresholds — or it flaps |
| **Backpressure** | Signalling upstream to slow down | Bounded queue plus 429 with `Retry-After` |

---

## Agents, adaptation & safety

| Term | Definition | What matters about it |
|---|---|---|
| **Agent** | A loop where the model chooses the next action | Every hard problem here is loop control |
| **ReAct** | Interleaved reasoning and acting | The reasoning step is what enables recovery from surprises |
| **Tool / function calling** | Model emits a structured call against a schema | Tool descriptions and error messages decide quality more than model choice |
| **Trajectory** | The sequence of steps taken | Score it separately from the outcome; a lucky path will not generalise |
| **MCP** | Model Context Protocol | A standard way to expose tools and resources to models |
| **LoRA** | Low-rank adapters over frozen weights | ~0.1% of parameters; adapters swap per request |
| **QLoRA** | LoRA over a 4-bit quantized base | Fine-tuning on consumer hardware |
| **Catastrophic forgetting** | Losing general ability while gaining a narrow one | Routinely unmeasured; evaluate a general set before and after |
| **RLHF / DPO** | Aligning to human preferences | RLHF uses a reward model; DPO optimises preferences directly and is simpler |
| **Prompt injection** | Instructions smuggled in as data | The model cannot separate instructions from data; controls must be architectural |
| **Indirect injection** | Injection via retrieved content | Needs no malicious user; with tools it becomes exfiltration |
| **Dual-LLM pattern** | Privileged model never reads untrusted text | The strongest structural mitigation; restrictive but addresses the cause |
| **Least privilege** | Tools can do only what is needed | Bounds the blast radius when injection succeeds — and assume it will |
| **Denial of wallet** | Driving cost rather than stealing data | Rate limits and `max_tokens` are security controls, not just capacity ones |

---

## Business

| Term | Definition | What matters about it |
|---|---|---|
| **Contribution margin** | Revenue minus variable cost per unit | LLM cost scales with usage, so heavy users can be loss-making |
| **Build vs buy** | Hosted API versus self-hosting | Decided by hidden costs — on-call, upgrades, expertise — not per-token price |
| **Moat** | What competitors cannot copy | Proprietary data, workflow lock-in, distribution, regulation. Not prompts or model choice |
| **Batch API** | Asynchronous processing at reduced price | Roughly half price where latency permits |
| **Shadow mode** | Run the new system without showing output | The correct first rollout step; real traffic, zero user risk |
| **Canary** | Small percentage of live traffic | Catches what offline evaluation cannot |

---

## How to use this page

Every entry here is expanded somewhere in the handbook. If a one-line definition
is not enough, the page that covers it properly is one search away — and if a
term appears here that you cannot yet explain to a sceptical interviewer, that
page is where to go next.
