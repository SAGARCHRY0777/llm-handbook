# LLM Handbook

A working engineer's handbook for building, testing, operating and arguing about
LLM systems. Every topic is written at three depths — basic, intermediate,
advanced — and examined from **seven seats**: user, coder, tester, system
designer, architect, CEO, and market.

**Live site:** enable GitHub Pages on `main` → `/docs` (see below).

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
npm run serve     # preview on http://localhost:4180
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

---

## Publishing

`docs/` is committed on purpose, so GitHub Pages can serve it directly:

**Settings → Pages → Source: `main` / `/docs`**

No Pages-source change to "GitHub Actions" is required, and no deploy workflow
can fail silently. The trade-off is that build output lives in the repo, so CI
fails the build if `docs/` was not rebuilt after a content change — otherwise
the published site would quietly drift from the source.

---

## Status

All modules written. Nothing is padded to look finished.

| Module | Pages |
|---|---|
| **LLM foundations** | Transformers & attention · Tokenization · Decoding & sampling · LLM APIs & model selection · Prompt engineering |
| **Retrieval & advanced RAG** | Chunking & ingestion · Embeddings & vector databases · Reranking · Query transformation & HyDE · Corrective & self-RAG |
| **Evaluation & judging** | LLM as a judge · Drift detection · Regression gates · Bias & explainability |
| **Inference optimization** | Quantization · Distillation & pruning |
| **Orchestration frameworks** | LangChain, LlamaIndex, DSPy |
| **Agents & safety** | Agents & tool use · Guardrails & security |
| **Training & adaptation** | Fine-tuning & adaptation |
| **Deployment & operations** | Serving & operations |
| **Market & business** | Unit economics, build vs buy, where the moat is not |
| **Reference** | Glossary — every term, one line each |

