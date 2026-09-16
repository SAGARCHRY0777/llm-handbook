# LLM Handbook

A working engineer's handbook for building, testing, operating and arguing about
LLM systems. Every topic is written at three depths — basic, intermediate,
advanced — and examined from **seven seats**: user, coder, tester, system
designer, architect, CEO, and market.

**Live site:** https://SAGARCHRY0777.github.io/llm-handbook/

---

## Why this exists

Most LLM learning material is written for exactly one reader: someone about to
write code. That leaves out the person who has to test a non-deterministic
system, the architect who has to live with the vendor lock-in for three years,
and the executive who has to justify the bill.

Each page here answers all of them, because in an interview — and in a design
review — you get asked from whichever seat the person across the table sits in.

## What it is not

It is not a rewrite of material that already exists elsewhere. Where a subject
is covered well in the companion study notes (transformers, RAG end-to-end,
chunking, embeddings, reranking, agents, LangGraph, MCP, Text2SQL, guardrails),
this handbook links there rather than saying it twice. It is written **gap
first**: the missing material comes before the tidy material.

---

## Page structure

Every topic follows the same eight parts, so you always know where to look:

| Part | Contents |
|---|---|
| 1 · Diagram | The mental model as a picture, before any prose |
| 2 · Design | The components, and why each is load-bearing |
| 3 · Flow | The sequence, in the order it happens |
| 4 · UML | Structure — class, state, or sequence diagram |
| 5 · Example | Code you can run |
| 6 · Depth | Failure modes, behaviour at scale, real trade-offs |
| 7 · From each seat | The topic seen by all seven roles |
| 8 · Interview questions | What gets asked, and the answer sketch |

Plus a **stop condition** — the sentence that tells you the topic is finished,
so reading has an end.

---

## Running it

```bash
npm install
npm run build     # content/*.md -> docs/
npm run serve     # preview on http://localhost:4281
```

Add a page by adding a markdown file to `content/` with frontmatter:

```markdown
---
title: Quantization
slug: quantization
module: optimization
order: 20
status: live
summary: One line, used in search results and the page description.
---
```

`module` must match an id in `MODULES` in `scripts/build.mjs`; that list also
fixes the order modules appear in the sidebar.

### Diagrams

Fenced ` ```mermaid ` blocks render client-side, and re-render when the reader
switches theme. Flowcharts, sequence diagrams and state diagrams all work.
ASCII diagrams in plain code fences are used where a hand-drawn layout carries
more than a generated one.

### Interactive calculators

A fenced ` ```widget ` block naming a calculator mounts one:

```markdown
```widget
kv-cache
```
```

Five are registered in `site/widgets.js`: `kv-cache`, `prefill-share`,
`cascade`, `bubble`, `softmax`. Adding one is a function plus a line in the
`WIDGETS` registry — no build change.

**The rule they follow:** every widget is the live twin of a Python block on the
same page, and the two must agree.

### Experiments

A ` ```lab ` block mounts an experiment from `site/labs.js`:

```markdown
```lab
bm25
```
```

The difference from a widget is the point. A widget moves a slider over a
formula; a **lab runs the page's actual algorithm, in your browser, on text you
type**. The tokenizer lab trains a real BPE merge loop on your corpus. The BM25
lab computes real IDF, k1 saturation and b length-normalisation on your
documents. The quantizer fits a real scale and zero-point and shows you the
round-trip error.

That gives one hard rule: **implement the mechanism, do not mimic it.** A
tokenizer that splits on spaces teaches the wrong thing, so a page whose honest
experiment will not fit gets no lab.

Fourteen are registered: `tokenizer`, `attention`, `sampler`, `chunker`, `bm25`,
`similarity`, `quantize`, `paged`, `prefix`, `config`, `needle`, `gate`,
`queue`, `lora`. Adding one is a function plus a registry line — no build
change. Labs are progressive enhancement and hidden in print, same as widgets.
 The reader moves a slider to build intuition,
then reads the code to see exactly how the number was produced. A widget that
disagrees with the code beside it is worse than no widget, so the defaults are
checked against the page's own tables.

They are progressive enhancement. Without JavaScript the fence renders a short
line pointing at the code block, which is the real content; nothing is lost but
the slider.

---

## Publishing

`docs/` is committed on purpose, so GitHub Pages serves it directly. Pages is
configured as **Source: `main` / `/docs`** — already enabled; nothing to set up.

No Pages-source change to "GitHub Actions" is required, and no deploy workflow
can fail silently. The trade-off is that build output lives in the repo, so CI
fails the build if `docs/` was not rebuilt after a content change — otherwise
the published site would quietly drift from the source.

---

## Status

All modules written. Nothing is padded to look finished.

| Module | Pages |
|---|---|
| **LLM foundations** | Transformers · Tokenization · Decoding · Model selection · Prompt engineering · Multimodal · Long context · Reasoning models |
| **Retrieval & advanced RAG** | Chunking · Embeddings & vector databases · Reranking · Query transformation & HyDE · Corrective & self-RAG · Text2SQL · GraphRAG |
| **Evaluation & judging** | LLM as a judge · Drift detection · Regression gates · Bias & explainability |
| **Inference optimization** | Quantization · Distillation & pruning |
| **Orchestration frameworks** | LangChain, LlamaIndex, DSPy |
| **Agents & safety** | Agents & tool use · Guardrails & security |
| **Training & adaptation** | Fine-tuning · Synthetic data generation |
| **Deployment & operations** | Serving & operations · Caching strategies |
| **Market & business** | Unit economics, build vs buy, where the moat is not |
| **Practice & interviews** | System design walkthroughs · Interview question bank · Learning paths |
| **Reference** | Glossary · Research papers · Numbers to know · Anti-patterns |


---

## Companion repos

| Repo | Round it prepares |
|---|---|
| [dsa-handbook](https://github.com/SAGARCHRY0777/dsa-handbook) | Coding — patterns, ladders, worked solutions in Python and Java |
| [system-design-handbook](https://github.com/SAGARCHRY0777/system-design-handbook) | System design — the 45-minute framework, building blocks, worked designs |

| [system-design-lab](https://github.com/SAGARCHRY0777/system-design-lab) | The depth reference behind the round — 123 pages, 21 sections, 325 diagrams, runnable implementations |

---

**Sagar Chaudhary** — AI Engineer, industrial & manufacturing AI · Bengaluru  
[Portfolio](https://sagarchry0777.github.io) · [GitHub](https://github.com/SAGARCHRY0777) · [LinkedIn](https://www.linkedin.com/in/sagar-chaudhary777/)
