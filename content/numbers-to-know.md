---
title: Numbers to know
slug: numbers-to-know
module: reference
order: 92
status: live
level: reference
summary: The arithmetic you should be able to do on a whiteboard without looking anything up.
---

# Numbers to know

In a system design round nobody hands you a calculator. What separates a
convincing answer from a vague one is being able to say *"that's about 14
gigabytes, so it won't fit"* without pausing.

Everything here is approximate on purpose. The point is the order of magnitude
and the shape of the trade-off — being able to reason, not to quote.

---

## Model memory

**The one formula:** `bytes = parameters × bytes_per_parameter`

| Precision | Bytes/param | 7B | 13B | 70B |
|---|---|---|---|---|
| FP32 | 4 | 28 GB | 52 GB | 280 GB |
| FP16 / BF16 | 2 | 14 GB | 26 GB | 140 GB |
| INT8 / FP8 | 1 | 7 GB | 13 GB | 70 GB |
| INT4 | 0.5 | 3.5 GB | 6.5 GB | 35 GB |

Add **15–20%** for activations and framework overhead, plus the KV cache below.

> **The shortcut worth memorising:** at FP16, gigabytes ≈ 2 × billions of
> parameters. At INT4, gigabytes ≈ half the billions. A 70B at INT4 is ~35 GB
> and fits on one 40 GB card; at FP16 it does not fit on two.

---

```sim
envelope
```

---

## KV cache

```
   bytes = 2 × layers × kv_heads × head_dim × seq_len × batch × bytes_per_value
```

For a Llama-3-8B shape (32 layers, 8 KV heads with GQA, head_dim 128, FP16):

| Context | Batch 1 | Batch 8 | Batch 32 |
|---|---|---|---|
| 4k | 0.27 GB | 2.1 GB | 8.6 GB |
| 32k | 2.1 GB | 17 GB | 69 GB |
| 128k | 8.6 GB | 69 GB | 275 GB |

**Read the diagonal.** At long context and real batch sizes the cache dwarfs the
16 GB of weights. This is why context length and concurrency trade directly
against each other, and why "we support 128k" is a capacity statement.

---

## Latency

| Quantity | Rough value |
|---|---|
| **Time to first token**, short prompt | 200–500 ms |
| **TTFT**, 10k-token prompt | 1–3 s |
| **Per output token**, hosted frontier model | 10–30 ms |
| **Per output token**, small model | 3–10 ms |
| **Embedding a short text** | 5–20 ms |
| **ANN search**, 1M vectors | 1–10 ms |
| **Cross-encoder rerank**, 50 pairs | 50–150 ms |
| **Total for a 400-token answer** | 4–10 s |

**The decode ceiling from bandwidth alone**, batch 1:

```
   tokens/sec ≈ memory_bandwidth / model_bytes

   7B @ FP16 on 2 TB/s   =  2000 / 14   ≈ 143 tok/s
   7B @ INT4 on 2 TB/s   =  2000 / 3.5  ≈ 571 tok/s
```

If your measured rate is far below the ceiling, quantization is not your problem
— look at batching, queueing or the framework.

---

## Tokens

| Rule of thumb | Value |
|---|---|
| English prose | ~4 characters ≈ 0.75 words per token |
| A page of text | ~500 tokens |
| Code | ~30% more tokens than prose for the same characters |
| Non-Latin scripts | 2–4× more tokens for the same meaning |
| A typical RAG context (5 chunks) | 2,000–3,000 tokens |
| A long system prompt | 500–2,000 tokens |

**100k words ≈ 133k tokens.** Useful for "will this book fit in the context
window" questions, and the answer is usually no.

---

## Cost

Illustrative tiers per million tokens — **verify current prices before quoting
them**, they move downward regularly:

| Tier | Input | Output |
|---|---|---|
| Frontier | ~$3 | ~$15 |
| Mid | ~$1 | ~$4 |
| Small | ~$0.25 | ~$1.25 |

```
   cost per request = (in_tokens × in_price + out_tokens × out_price) / 1e6
```

A typical RAG request — 2,000 in, 400 out, frontier tier:

```
   (2000 × 3 + 400 × 15) / 1e6  =  $0.012
```

| Volume | Cost at that shape |
|---|---|
| 1,000 requests | $12 |
| 100k requests | $1,200 |
| 1M requests | $12,000 |

**Output is roughly 5× the price of input.** A summariser and a generator with
the same total token count have very different bills, so estimate them
separately.

**Break-even against one GPU** (~$1,500/month) at that request shape: roughly
**125,000 requests/month**. Below that, self-hosting is not a cost decision.

---

## Retrieval & evaluation

| Quantity | Typical value |
|---|---|
| Chunk size, prose | 256–512 tokens |
| Chunk overlap | 10–20% of chunk size |
| Retrieval depth before reranking | 20–50 |
| Final top-k to the model | 3–5 |
| Embedding dimensions | 384 / 768 / 1536 / 3072 |
| Index memory, 1M × 768 dims, FP32 | ~3.2 GB + graph |
| HNSW recall at defaults | 92–98% — **measure yours** |

**Confidence intervals on a pass rate** — the table that stops you shipping noise:

| n | at p=0.5 | at p=0.8 | at p=0.9 |
|---|---|---|---|
| 30 | ±18 pts | ±14 pts | ±11 pts |
| 50 | ±14 pts | ±11 pts | ±8 pts |
| 100 | ±10 pts | ±8 pts | ±6 pts |
| 500 | ±4 pts | ±4 pts | ±3 pts |

> **On 50 items, an improvement from 80% to 84% is indistinguishable from
> noise.** If you remember one line from this page, this is the one — it is the
> most common statistical error in LLM engineering, and saying it out loud is a
> strong senior signal.

**Judge agreement (Cohen's kappa):**

| Kappa | Reading |
|---|---|
| < 0.4 | Noise. The judge is not measuring your construct |
| 0.4–0.6 | Usable if you report it alongside every number |
| 0.6–0.8 | Good. You can gate on it |
| > 0.8 | Rare; usually means the task was nearly mechanical |

---

## Agents

**Reliability compounds.** At *p* success per step:

| Steps | p=0.90 | p=0.95 | p=0.99 |
|---|---|---|---|
| 3 | 73% | 86% | 97% |
| 5 | 59% | 77% | 95% |
| 10 | 35% | 60% | 90% |
| 20 | 12% | 36% | 82% |

**This single table explains agent design.** Long autonomous chains do not fail
because models are weak; they fail because reliability multiplies. Every
mitigation — checkpoints, decomposition, human approval — is a way of shortening
the chain.

---

## Fine-tuning

| Quantity | Typical value |
|---|---|
| LoRA rank | 8–16 for style, 32–64 for harder adaptation |
| LoRA trainable parameters | ~0.1% of the model |
| Adapter file size | 10–200 MB |
| Minimum useful dataset | 500–1,000 **consistent** examples |
| Epochs | 1–3 |
| Learning rate | 1e-4 to 2e-4 (higher than full fine-tuning) |
| QLoRA memory, 7B | ~6 GB — a consumer GPU |
| Full fine-tune memory, 7B | ~80 GB+ |

---

## Using this on a whiteboard

The five that come up most, in the form you should be able to produce cold:

1. **"Will it fit?"** → params × bytes/param, plus 20%, plus the KV cache.
2. **"How fast can it go?"** → bandwidth ÷ model bytes = tokens/sec ceiling.
3. **"What will it cost?"** → tokens × price, input and output separately.
4. **"Is that improvement real?"** → check n against the interval table.
5. **"Will the agent work?"** → p per step, raised to the number of steps.

Being able to do these in your head is disproportionately convincing, because it
demonstrates you have actually built something rather than read about it.
